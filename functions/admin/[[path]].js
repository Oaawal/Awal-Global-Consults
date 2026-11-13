/**
 * Admin dashboard: /admin
 *
 *   GET  /admin/login, POST /admin/login     sign in with a one-time emailed code
 *   POST /admin/logout
 *   GET  /admin/                             overview
 *   GET  /admin/cases                        case list (?view=…, ?q=search)
 *   GET  /admin/case/:id                     case (?tab=summary|documents|activity|records)
 *   POST /admin/case/:id/status|note|followup|hold|erase
 *   GET  /admin/doc/:id                      open an uploaded document
 *   GET  /admin/clients, /admin/client/:id   clients and their data rights
 *   GET  /admin/client/:id/export            download everything held on a client
 *   POST /admin/client/:id/update|request|erase
 *   POST /admin/request/:id/done
 *   GET  /admin/records                      retention review, holds, requests, backups
 *   GET  /admin/backup/:date                 download a nightly backup
 *   GET  /admin/activity                     audit log
 *
 * Every page except sign-in requires a session (see _lib/admin-auth.js), and
 * every view of personal data or change is written to the audit log.
 */
import { createLoginCode, verifyLoginCode, createSession, currentAdmin, endSession, isAdminEmail } from '../_lib/admin-auth.js';
import {
  loginPage, overviewPage, funnelPage, casesPage, casePage, clientsPage, clientPage, recordsPage, activityPage,
  notFoundPage, simplePage, flashFor, CASE_VIEWS, ACTIVITY_FILTERS, importPage, extensionPage
} from '../_lib/admin-views.js';
import { statusesFor, statusInfo, retentionFor, documentContentType, autoFollowUp, isOpen } from '../_lib/cases.js';
import { MANIFEST, SERVICE_WORKER, APP_SCRIPT, FILING_SCRIPT } from '../_lib/admin-app.js';
import { filingPack } from '../_lib/filing-pack.js';
import { handleExtensionApi, listKeys, createKey, revokeKey } from '../_lib/extension-api.js';
import { vapidKeys, notifyAdmins } from '../_lib/webpush.js';
import { bounceSettings, ensureBounceWebhook } from '../_lib/bounces.js';
import { uploadUrl, detailsUrl, deliveredUrl } from '../_lib/upload-links.js';
import { awaitingDetails } from '../_lib/records.js';
import { funnelStats, PERIODS } from '../_lib/funnel.js';
import { serviceProgress, stepInfo, isStep } from '../_lib/service-progress.js';
import { BUSINESS_FIELDS } from '../_lib/cac.js';
import { missingForCase } from '../_lib/requirements.js';
import { START_PRICES, PAYMENT_METHODS, KIND_LABEL, billingSettings, saveBillingSettings, nextNumber, totals, renderDoc, relatedDocs, docUrl, money, addDays, lineItems, discountOf, discountLabelOf } from '../_lib/billing.js';
import { renderPdf, pdfFilename } from '../_lib/billing-pdf.js';
import { bytesToBase64 } from '../_lib/brevo.js';
import { fileMatchesName } from '../_lib/file-check.js';
import { CHANNELS, PAST_STATUSES, validatePast, savePast, importCsv, csvTemplate, dataSubjectCount } from '../_lib/past-records.js';
import { isNewDevice, signInDetail, alertNewSignIn, noteFailedCode, revokeAllSessions, recentSignIns } from '../_lib/security.js';
import { EARLY_ERASE_REASONS, eraseBlocker, eraseCase, exportClient, listBackups, isBackupKey } from '../_lib/compliance.js';
import { sendBrevoEmail } from '../_lib/brevo.js';
import { adminLoginCodeEmail, caseStatusEmail, missingInfoEmail, billingEmail, detailsFormEmail } from '../_lib/email-templates.js';

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin', // not no-referrer: that makes browsers send "Origin: null" on form posts
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
};

const OPEN_SQL = "c.status NOT IN ('closed', 'cancelled', 'converted')";
const CASE_VIEW_SQL = {
  open: OPEN_SQL,
  new: "c.status = 'new'",
  waiting: "c.status IN ('quote_sent', 'awaiting_documents')",
  progress: "c.status IN ('paid', 'filed', 'approved')",
  followups: 'c.follow_up_at IS NOT NULL',
  closed: `NOT (${OPEN_SQL})`,
  all: '1 = 1'
};
// Records past their retention date that still hold personal data
const REVIEW_SQL = 'c.retain_until IS NOT NULL AND c.retain_until < ?1 AND c.legal_hold = 0 AND c.purged_at IS NULL';

function html(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS, ...extra } });
}

function redirect(location, extra = {}) {
  return new Response(null, { status: 303, headers: { Location: location, ...SECURITY_HEADERS, ...extra } });
}

/** Only allow redirects back into the dashboard after sign-in. */
function safeNext(next) {
  return typeof next === 'string' && /^\/admin\/[A-Za-z0-9/_\-?=&%.]*$/.test(next) && !next.startsWith('//') ? next : '/admin/';
}

function likePattern(q) {
  return `%${q.replace(/[%_\\]/g, m => '\\' + m)}%`;
}

// Requests whose log writes can finish after the page is sent (set per request in onRequest)
const BACKGROUND = new WeakMap();

/** Write to the audit log. The page doesn't wait for it: the write completes in the background. */
async function audit(env, request, actor, action, entityType, entityId, detail) {
  const write = env.DB.prepare(
    'INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
  ).bind(new Date().toISOString(), actor, action, entityType, entityId, detail ? JSON.stringify(detail) : null,
    request.headers.get('CF-Connecting-IP')).run();
  const later = BACKGROUND.get(request);
  if (later) later(write.catch(err => console.error('audit write failed:', action, err && err.message)));
  else await write;
}

function auditStmt(env, request, actor, action, entityType, entityId, detail, at) {
  return env.DB.prepare(
    'INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
  ).bind(at, actor, action, entityType, entityId, detail ? JSON.stringify(detail) : null, request.headers.get('CF-Connecting-IP'));
}

const DOC_EXT = /\.(pdf|jpe?g|png)$/i;
const DOC_MAX = 7 * 1024 * 1024;

/** Save an uploaded file to a case's private storage; returns the row insert to batch. */
async function storeCaseDocument(env, caseId, name, file) {
  const id = crypto.randomUUID();
  const key = `case/${caseId}/${id}`;
  await env.DOCS.put(key, new Uint8Array(await file.arrayBuffer()), { httpMetadata: { contentType: documentContentType(name) }, customMetadata: { caseId, docId: id, fileName: name } });
  return { id, stmt: env.DB.prepare('INSERT INTO documents (id, case_id, file_name, content_type, size_bytes, storage_key, uploaded_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(id, caseId, name, documentContentType(name), file.size, key, new Date().toISOString()) };
}

async function loadCase(env, id) {
  return env.DB.prepare(
    `SELECT c.*, cl.full_name, cl.email, cl.phone, cl.anonymised_at
     FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE c.id = ?1`
  ).bind(id).first();
}

/** Counts shown as badges on the navigation. */
async function navBadges(env) {
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM cases WHERE status = 'new') AS cases,
            (SELECT COUNT(*) FROM cases c WHERE ${REVIEW_SQL}) + (SELECT COUNT(*) FROM data_requests WHERE completed_at IS NULL) AS records`
  ).bind(new Date().toISOString()).first();
  return { cases: row?.cases || 0, records: row?.records || 0 };
}

// ── Billing helpers ─────────────────────────────────────────────
function billPrefill(c, docs, fromId) {
  let f = {}; try { f = JSON.parse(c.form_data || '{}') || {}; } catch (e) {}
  const from = fromId ? docs.find(d => d.id === fromId) : null;
  if (from) {
    return { kind: 'invoice', related: from.kind === 'quote' ? from.id : '', client: JSON.parse(from.client_json), category: from.category,
      items: JSON.parse(from.items_json), notes: '' }; // a discount line is shown in the discount box, not as an item
  }
  const services = String(c.services || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    kind: 'quote', related: '',
    client: { name: f['Business Name'] || f['Proposed Name 1'] || c.full_name, address: f['Business Address'] || f['Address'] || f['Passport Address'] || f['Person 1 Residential Address'] || '', tin: '', email: c.email, phone: c.phone },
    category: services.join(', '),
    items: services.map(svc => ({ description: svc, qty: 1, unit: START_PRICES[svc] || '' })),
    notes: ''
  };
}

/** PDF copies to attach. A PDF that fails to build is left out: the email still carries the link. */
async function billingAttachments(env, docs) {
  const out = [];
  for (const d of docs) {
    try { out.push({ name: pdfFilename(d), content: bytesToBase64(await renderPdf(d, await relatedDocs(env, d))) }); }
    catch (err) { console.error('billing pdf:', d.number, err && err.message); }
  }
  return out;
}

/** extraDocs: further documents sent in the same email (the engagement letter with a receipt): linked and attached. */
async function sendBillingDoc(env, request, origin, actor, c, doc, extraDocs = []) {
  const viewUrl = await docUrl(env, doc.id, origin);
  const extraLinks = [];
  for (const d of extraDocs) extraLinks.push({ label: `Your ${KIND_LABEL[d.kind].toLowerCase()} ${d.number}`, url: await docUrl(env, d.id, origin) });
  if (doc.kind === 'receipt' && c.kind === 'application' && awaitingDetails(c) && isOpen(c.status)) {
    extraLinks.push({ label: 'Next step: complete your application details', url: await detailsUrl(env, c.id, origin) });
  }
  const attachments = await billingAttachments(env, [doc, ...extraDocs]);
  const dateLine = doc.kind === 'invoice' ? `Due ${new Date(doc.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : doc.kind === 'quote' ? `Valid until ${new Date(doc.valid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : doc.kind === 'receipt' ? 'Paid, thank you' : '';
  const cl = JSON.parse(doc.client_json);
  await sendBrevoEmail(env, {
    to: { email: c.email, name: c.full_name },
    subject: `Your ${KIND_LABEL[doc.kind].toLowerCase()} ${doc.number} from Awal Global Consults`,
    html: billingEmail({ kind: doc.kind, number: doc.number, clientName: cl.name, total: doc.kind === 'receipt' ? doc.amount_paid : doc.total, dateLine, viewUrl, money, extraLinks, attached: attachments.length > 0 }),
    replyTo: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' },
    attachments
  });
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE billing_docs SET sent_at = ?2, status = CASE WHEN status = 'issued' THEN 'sent' ELSE status END WHERE id = ?1").bind(doc.id, now),
    env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'note', ?2, ?3, ?4)").bind(c.id, `Emailed ${KIND_LABEL[doc.kind].toLowerCase()} ${doc.number} to ${c.email}`, actor, now),
    auditStmt(env, request, actor, 'billing.sent', 'billing', doc.id, { number: doc.number }, now)
  ]);
}

async function createBillingDoc(env, request, actor, c, d) {
  const id = crypto.randomUUID();
  const now = d.issuedAt || new Date().toISOString();
  const number = await nextNumber(env, d.kind, now);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO billing_docs (id, case_id, kind, number, status, issued_at, due_at, valid_until, related_id, category, client_json, items_json,
        vat_rate, subtotal, vat_amount, total, amount_paid, payment_method, payment_ref, paid_at, notes, created_by, created_at)
      VALUES (?1, ?2, ?3, ?4, 'issued', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)`)
      .bind(id, c.id, d.kind, number, now, d.dueAt || null, d.validUntil || null, d.related || null, d.category || null, JSON.stringify(d.client), JSON.stringify(d.items),
        d.vatRate || 0, d.subtotal || 0, d.vat || 0, d.total || 0, d.amountPaid ?? null, d.method || null, d.ref || null, d.paidAt || null, d.notes || null, actor, new Date().toISOString()),
    env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'note', ?2, ?3, ?4)").bind(c.id, `${KIND_LABEL[d.kind]} ${number} issued${d.total ? ` for ${money(d.total)}` : ''}`, actor, new Date().toISOString()),
    auditStmt(env, request, actor, 'billing.issued', 'billing', id, { number, kind: d.kind, total: d.total || 0 }, new Date().toISOString())
  ]);
  return { id, number };
}

/** Any unexpected failure shows a plain error page (and is logged) instead of Cloudflare's error 1101. */
export async function onRequest(context) {
  if (typeof context.waitUntil === 'function') BACKGROUND.set(context.request, p => context.waitUntil(p));
  try {
    return await handle(context);
  } catch (err) {
    console.error('admin error:', context.request.method, new URL(context.request.url).pathname, err && err.stack || err);
    return new Response(simplePage('Something went wrong', 'That action could not be completed and nothing was changed. Please go back and try again. If it keeps happening, tell your developer the time it happened.'), {
      status: 500, headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function handle(context) {
  const { request, env, params } = context;
  if (!env.DB || !env.DOCS) return html(simplePage('Not connected', 'The records database is not connected to this site.'), 503);

  const url = new URL(request.url);
  const parts = [].concat(params.path || []).filter(Boolean);
  const route = '/' + parts.join('/');
  const method = request.method;

  // App files (public: they contain no case data)
  if (method === 'GET' && route === '/manifest.webmanifest') {
    return new Response(MANIFEST, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (method === 'GET' && (route === '/sw.js' || route === '/app.js' || route === '/filing.js')) {
    return new Response(route === '/sw.js' ? SERVICE_WORKER : route === '/filing.js' ? FILING_SCRIPT : APP_SCRIPT, {
      headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Service-Worker-Allowed': '/admin/' }
    });
  }

  // Filing assistant extension: read-only, signs in with its own connection key (no cookies)
  if (parts[0] === 'api') {
    return handleExtensionApi(env, request, parts, (actor, action, type, id, detail) => audit(env, request, actor, action, type, id, detail));
  }

  // Form posts must come from this site (blocks cross-site request forgery)
  if (method === 'POST' && request.headers.get('Origin') !== url.origin) {
    return html(simplePage('Blocked', 'This request was blocked for security reasons. Please go back and try again.'), 403);
  }

  // ── Sign-in ─────────────────────────────────────────────────
  if (route === '/login') {
    if (method === 'GET') {
      if (await currentAdmin(env, request)) return redirect(safeNext(url.searchParams.get('next')));
      return html(loginPage({ next: safeNext(url.searchParams.get('next')) }));
    }
    if (method === 'POST') {
      const form = await request.formData();
      const email = String(form.get('email') || '').trim().toLowerCase().slice(0, 254);
      const next = safeNext(String(form.get('next') || ''));

      if (form.get('action') === 'verify') {
        if (await verifyLoginCode(env, email, form.get('code'))) {
          const fresh = await isNewDevice(env, email, request);
          const cookie = await createSession(env, request, email);
          await audit(env, request, `admin:${email}`, 'login.success', 'admin', email, signInDetail(request));
          if (fresh) await alertNewSignIn(env, email, request);
          return redirect(next, { 'Set-Cookie': cookie });
        }
        if (isAdminEmail(env, email)) {
          await audit(env, request, `admin:${email}`, 'login.failed', 'admin', email, signInDetail(request));
          await noteFailedCode(env, email, request);
        }
        return html(loginPage({ step: 'code', email, next, error: 'That code is wrong or has expired. Check the latest email, or get a new code.' }), 401);
      }

      // Send a code. The reply is the same whether or not the address is authorised.
      const code = await createLoginCode(env, email);
      if (code) {
        await sendBrevoEmail(env, {
          to: { email },
          subject: `Your Awal dashboard login code: ${code}`,
          html: adminLoginCodeEmail({ code })
        });
        await audit(env, request, `admin:${email}`, 'login.code_sent', 'admin', email);
      }
      return html(loginPage({ step: 'code', email, next }));
    }
    return html('Method not allowed', 405);
  }

  // ── Everything below needs a signed-in admin ───────────────
  const admin = await currentAdmin(env, request);
  if (!admin) {
    if (method !== 'GET') return redirect('/admin/login');
    return redirect(`/admin/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  const actor = `admin:${admin}`;
  const ip = request.headers.get('CF-Connecting-IP');
  const flash = flashFor(url.searchParams.get('done'));

  // ── Past clients (before the website records) ──────────────
  if (route === '/import' && method === 'GET') {
    return html(importPage({ admin, badges: await navBadges(env), flash, channels: CHANNELS, statuses: PAST_STATUSES }));
  }
  if (route === '/import/template.csv' && method === 'GET') {
    return new Response(csvTemplate(), { headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="awal-past-clients-template.csv"' } });
  }
  if (route === '/import/one' && method === 'POST') {
    const fd = await request.formData();
    const f = {};
    for (const [k, v] of fd.entries()) if (typeof v === 'string') f[k] = v;
    const v = validatePast(f);
    if (v.error) return html(importPage({ admin, badges: await navBadges(env), flash: null, error: v.error, form: f, channels: CHANNELS, statuses: PAST_STATUSES }), 400);
    const r = await savePast(env, request, actor, v.record);
    if (r.duplicate) return redirect('/admin/import?done=import_dup');
    // Documents chosen on the form go onto the new case (same checks as every other upload)
    const files = fd.getAll('files').filter(x => typeof x !== 'string' && x.size > 0).slice(0, 10);
    let added = 0, refused = 0;
    if (files.length) {
      const now = new Date().toISOString(), stmts = [];
      for (const file of files) {
        const name = 'added-by-office--' + String(file.name || 'file').replace(/[\\/\r\n\0"]/g, '_').slice(0, 100);
        if (!DOC_EXT.test(name) || file.size > DOC_MAX || !(await fileMatchesName(name, file))) { refused++; continue; }
        const doc = await storeCaseDocument(env, r.caseId, name, file);
        stmts.push(doc.stmt, auditStmt(env, request, actor, 'document.added', 'document', doc.id, { file: name }, now));
        added++;
      }
      if (added) {
        stmts.push(env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'documents_added', ?2, ?3, ?4)")
          .bind(r.caseId, `Added ${added} document${added === 1 ? '' : 's'} with the past-client record`, actor, now));
        await env.DB.batch(stmts);
      }
    }
    if (refused) return redirect(`/admin/case/${r.caseId}?tab=documents&done=import_docs_partial`);
    return redirect(`/admin/case/${r.caseId}${added ? '?tab=documents&' : '?'}done=imported`);
  }
  if (route === '/import/csv' && method === 'POST') {
    const form = await request.formData();
    const file = form.get('file');
    let error = null, result = null;
    if (!file || typeof file === 'string' || !file.size) error = 'Choose a CSV file to upload.';
    else if (file.size > 2 * 1024 * 1024) error = 'That file is over 2MB. Split it into smaller files.';
    else if (!/\.csv$/i.test(file.name || '')) error = 'Save the spreadsheet as CSV first (File, Download, CSV in Google Sheets; Save As, CSV in Excel).';
    else result = await importCsv(env, request, actor, await file.text(), form.get('kind') === 'enquiry' ? 'enquiry' : 'application');
    return html(importPage({ admin, badges: await navBadges(env), flash: null, error, result, channels: CHANNELS, statuses: PAST_STATUSES }), error ? 400 : 200);
  }

  // ── Billing documents ──────────────────────────────────────
  if (route === '/billing-settings' && method === 'POST') {
    const form = await request.formData();
    await saveBillingSettings(env, { ...(await billingSettings(env)), vatRegistered: form.get('vat') === '1' });
    await audit(env, request, actor, 'billing.settings', 'admin', admin, { vatRegistered: form.get('vat') === '1' });
    const back = String(form.get('back') || '/admin/');
    return redirect(`${back.startsWith('/admin/') ? back : '/admin/'}${back.includes('?') ? '&' : '?'}done=vat_saved`);
  }
  if (parts[0] === 'billing' && parts[1]) {
    const doc = await env.DB.prepare('SELECT * FROM billing_docs WHERE id = ?1').bind(parts[1]).first();
    if (!doc) return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
    const c = await loadCase(env, doc.case_id);
    const backTo = key => redirect(`/admin/case/${doc.case_id}?tab=billing&done=${key}`);
    if (parts.length === 3 && parts[2] === 'pdf' && method === 'GET') {
      return new Response(await renderPdf(doc, await relatedDocs(env, doc)), { headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdfFilename(doc)}"`, 'Cache-Control': 'no-store' } });
    }
    if (parts.length === 2 && method === 'GET') {
      await audit(env, request, actor, 'billing.viewed', 'billing', doc.id, { number: doc.number });
      return new Response(renderDoc(doc, { ...(await relatedDocs(env, doc)), pdfUrl: `/admin/billing/${doc.id}/pdf` }), { headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'" } });
    }
    if (method !== 'POST' || !c) return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
    const form = await request.formData();
    if (parts[2] === 'send') {
      if (!c.email || doc.status === 'void') return backTo('bill_send_failed');
      try { await sendBillingDoc(env, request, url.origin, actor, c, doc); } catch (err) { console.error('billing send:', err && err.message); return backTo('bill_send_failed'); }
      return backTo('bill_sent');
    }
    if (parts[2] === 'void') {
      if (doc.status === 'paid') return backTo('unchanged');
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("UPDATE billing_docs SET status = 'void', voided_at = ?2 WHERE id = ?1").bind(doc.id, now),
        auditStmt(env, request, actor, 'billing.void', 'billing', doc.id, { number: doc.number }, now)
      ]);
      return backTo('bill_void');
    }
    if (parts[2] === 'payment' && doc.kind === 'invoice' && doc.status !== 'void') {
      const amount = Math.round(Number(String(form.get('amount') || '0').replace(/[^\d.]/g, '')) || 0);
      if (amount <= 0) return backTo('unchanged');
      const dateStr = String(form.get('date') || '');
      const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(`${dateStr}T12:00:00Z`).toISOString() : new Date().toISOString();
      const paidSoFar = (doc.amount_paid || 0) + amount;
      const now = new Date().toISOString();
      const rc = await createBillingDoc(env, request, actor, c, {
        kind: 'receipt', client: JSON.parse(doc.client_json), items: JSON.parse(doc.items_json), total: doc.total, subtotal: doc.subtotal, vat: doc.vat_amount, vatRate: doc.vat_rate,
        amountPaid: amount, method: String(form.get('method') || 'Bank transfer').slice(0, 40), ref: String(form.get('ref') || '').trim().slice(0, 80), paidAt,
        related: doc.id, category: doc.category, issuedAt: now, notes: `balance:${Math.max(0, doc.total - paidSoFar)}`
      });
      await env.DB.batch([
        env.DB.prepare('UPDATE billing_docs SET amount_paid = ?2, paid_at = ?3, status = ?4 WHERE id = ?1').bind(doc.id, paidSoFar, paidAt, paidSoFar >= doc.total ? 'paid' : 'part_paid'),
        auditStmt(env, request, actor, 'billing.paid', 'billing', doc.id, { number: doc.number, amount, receipt: rc.number }, now),
        env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'payment', ?2, ?3, ?4)")
          .bind(c.id, `${money(amount)} received against ${doc.number} (receipt ${rc.number}). ${paidSoFar >= doc.total ? 'Paid in full.' : `Part paid: balance ${money(doc.total - paidSoFar)}.`}`, actor, now)
      ]);
      let letter = null;
      if (form.get('letter') === '1') {
        letter = await createBillingDoc(env, request, actor, c, { kind: 'engagement', client: JSON.parse(doc.client_json), items: JSON.parse(doc.items_json), total: doc.total,
          related: doc.id, category: doc.category, notes: String(form.get('scope') || '').trim().slice(0, 600), issuedAt: now });
      }
      if (form.get('markpaid') === '1' && c.kind === 'application' && !['paid', 'filed', 'approved', 'delivered', 'closed'].includes(c.status)) {
        await env.DB.batch([
          env.DB.prepare("UPDATE cases SET status = 'paid', updated_at = ?2, status_changed_at = ?2 WHERE id = ?1").bind(c.id, now),
          env.DB.prepare("INSERT INTO case_events (case_id, event, from_status, to_status, note, actor, created_at) VALUES (?1, 'status_changed', ?2, 'paid', ?3, ?4, ?5)").bind(c.id, c.status, `Receipt ${rc.number}`, actor, now)
        ]);
      }
      if (form.get('send') === '1' && c.email) {
        try {
          const receiptDoc = await env.DB.prepare('SELECT * FROM billing_docs WHERE id = ?1').bind(rc.id).first();
          const letterDoc = letter ? await env.DB.prepare('SELECT * FROM billing_docs WHERE id = ?1').bind(letter.id).first() : null;
          await sendBillingDoc(env, request, url.origin, actor, c, receiptDoc, letterDoc ? [letterDoc] : []);
          if (letter) await env.DB.prepare("UPDATE billing_docs SET sent_at = ?2, status = 'sent' WHERE id = ?1").bind(letter.id, now).run();
        } catch (err) { console.error('receipt send:', err && err.message); return backTo('bill_send_failed'); }
      }
      return backTo('paid_saved');
    }
    return backTo('unchanged');
  }

  if (route === '/bounce-alerts' && method === 'POST') {
    try {
      await ensureBounceWebhook(env, url.origin);
      await audit(env, request, actor, 'bounces.enabled', 'admin', admin, null);
      return redirect('/admin/records?done=bounces#security');
    } catch (err) {
      console.error('bounce webhook:', err && err.message);
      return redirect('/admin/records?done=bounces_failed#security');
    }
  }

  // ── App notifications (this device) ─────────────────────────
  if (route === '/push/key' && method === 'GET') {
    const keys = await vapidKeys(env);
    return new Response(JSON.stringify({ publicKey: keys.publicKey }), { headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json' } });
  }
  if (route.startsWith('/push/') && method === 'POST') {
    const jsonOut = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json' } });
    let body = {};
    try { body = await request.json(); } catch (e) { /* empty body */ }
    if (route === '/push/subscribe') {
      const endpoint = String(body.endpoint || '');
      const keys = body.keys || {};
      if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !keys.p256dh || !keys.auth) return jsonOut({ error: 'Invalid subscription' }, 400);
      await env.DB.prepare(`INSERT INTO push_subscriptions (id, email, endpoint, p256dh, auth, user_agent, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(endpoint) DO UPDATE SET email = ?2, p256dh = ?4, auth = ?5, user_agent = ?6`)
        .bind(crypto.randomUUID(), admin, endpoint, String(keys.p256dh).slice(0, 200), String(keys.auth).slice(0, 100), (request.headers.get('User-Agent') || '').slice(0, 200), new Date().toISOString()).run();
      await audit(env, request, actor, 'push.enabled', 'admin', admin, null);
      return jsonOut({ ok: true });
    }
    if (route === '/push/unsubscribe') {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1 AND email = ?2').bind(String(body.endpoint || ''), admin).run();
      await audit(env, request, actor, 'push.disabled', 'admin', admin, null);
      return jsonOut({ ok: true });
    }
    if (route === '/push/test') {
      const r = await notifyAdmins(env, { title: 'Notifications are working', body: 'You will get an alert like this for new applications, enquiries and bookings.', url: '/admin/', tag: 'test' }, { email: admin });
      return jsonOut({ ok: true, sent: r.sent || 0 });
    }
    return jsonOut({ error: 'Not found' }, 404);
  }

  if (route === '/logout' && method === 'POST') {
    const form = await request.formData();
    if (form.get('scope') === 'all') {
      const ended = await revokeAllSessions(env, admin);
      await audit(env, request, actor, 'logout.all', 'admin', admin, { sessionsEnded: ended });
      return redirect('/admin/login', { 'Set-Cookie': await endSession(env, request) });
    }
    const cookie = await endSession(env, request);
    await audit(env, request, actor, 'logout', 'admin', admin);
    return redirect('/admin/login', { 'Set-Cookie': cookie });
  }

  // ── Overview ────────────────────────────────────────────────
  if (route === '/' && method === 'GET') {
    // Old links to the case list (/admin/?view=…) go to the new Cases page
    if (url.searchParams.has('view') || url.searchParams.has('q')) return redirect(`/admin/cases${url.search}`);
    const now = new Date().toISOString();
    const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString();
    const base = 'SELECT c.id, c.reference, c.kind, c.services, c.status, c.created_at, c.status_changed_at, c.follow_up_at, c.follow_up_note, cl.full_name FROM cases c JOIN clients cl ON cl.id = c.client_id';
    const funnelP = funnelStats(env, 30); // its own trip, alongside the batch below
    const [needs, follow, waiting, recent, counts, review, requests] = await env.DB.batch([
      env.DB.prepare(`${base} WHERE c.status = 'new' ORDER BY c.created_at LIMIT 6`),
      env.DB.prepare(`${base} WHERE c.follow_up_at IS NOT NULL AND c.follow_up_at <= ?1 ORDER BY c.follow_up_at LIMIT 6`).bind(weekAhead),
      env.DB.prepare(`${base} WHERE ${CASE_VIEW_SQL.waiting} ORDER BY c.status_changed_at LIMIT 6`),
      env.DB.prepare(`SELECT e.case_id, e.event, e.from_status, e.to_status, e.created_at, c.reference, c.kind FROM case_events e JOIN cases c ON c.id = e.case_id ORDER BY e.id DESC LIMIT 10`),
      env.DB.prepare(`SELECT SUM(${CASE_VIEW_SQL.new}) AS newCount, SUM(${CASE_VIEW_SQL.waiting}) AS waiting, SUM(${CASE_VIEW_SQL.progress}) AS inProgress,
                             SUM(c.follow_up_at IS NOT NULL AND c.follow_up_at <= ?1) AS followUpsDue FROM cases c`).bind(weekAhead),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM cases c WHERE ${REVIEW_SQL}`).bind(now),
      env.DB.prepare('SELECT COUNT(*) AS n FROM data_requests WHERE completed_at IS NULL')
    ]);
    const s = (counts.results || [])[0] || {};
    const reviewN = review.results[0].n, requestN = requests.results[0].n;
    const alerts = [];
    if (reviewN) alerts.push({ href: '/admin/records', tone: 'warn', icon: 'clock', text: `${reviewN} record${reviewN === 1 ? ' has' : 's have'} passed the retention period: review for erasure.` });
    if (requestN) alerts.push({ href: '/admin/records', tone: 'warn', icon: 'inbox', text: `${requestN} client data request${requestN === 1 ? ' is' : 's are'} open.` });
    return html(overviewPage({
      funnel: await funnelP, money,
      admin, badges: { cases: s.newCount || 0, records: reviewN + requestN },
      stats: { newCount: s.newCount || 0, waiting: s.waiting || 0, inProgress: s.inProgress || 0, followUpsDue: s.followUpsDue || 0 },
      needsReply: needs.results || [], followUps: follow.results || [], waiting: waiting.results || [], recent: recent.results || [], alerts
    }));
  }

  // ── Funnel: requests → quoted → invoiced → paid ─────────────
  if (route === '/funnel' && method === 'GET') {
    const period = PERIODS[url.searchParams.get('period')] ? url.searchParams.get('period') : '30';
    return html(funnelPage({ admin, badges: await navBadges(env), period, periods: PERIODS, f: await funnelStats(env, period), money }));
  }

  // ── Case list ───────────────────────────────────────────────
  if (route === '/cases' && method === 'GET') {
    const view = CASE_VIEW_SQL[url.searchParams.get('view')] ? url.searchParams.get('view') : 'open';
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    const searchSql = q
      ? " AND (c.reference LIKE ?1 ESCAPE '\\' OR cl.full_name LIKE ?1 ESCAPE '\\' OR cl.email LIKE ?1 ESCAPE '\\' OR cl.phone LIKE ?1 ESCAPE '\\' OR c.services LIKE ?1 ESCAPE '\\')"
      : '';
    const args = q ? [likePattern(q)] : [];
    const [list, counts] = await env.DB.batch([
      env.DB.prepare(
        `SELECT c.id, c.reference, c.kind, c.services, c.status, c.created_at, c.follow_up_at, cl.full_name,
                (SELECT COUNT(*) FROM documents d WHERE d.case_id = c.id AND d.deleted_at IS NULL) AS docs
         FROM cases c JOIN clients cl ON cl.id = c.client_id
         WHERE ${CASE_VIEW_SQL[view]}${searchSql}
         ORDER BY ${view === 'followups' ? 'c.follow_up_at ASC' : 'c.created_at DESC'} LIMIT 300`).bind(...args),
      env.DB.prepare(
        `SELECT ${CASE_VIEWS.map(v => `SUM(CASE WHEN ${CASE_VIEW_SQL[v.key]} THEN 1 ELSE 0 END) AS "${v.key}"`).join(', ')}
         FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE 1 = 1${searchSql}`).bind(...args)
    ]);
    return html(casesPage({ admin, badges: await navBadges(env), rows: list.results || [], view, q, counts: (counts.results || [])[0] || {} }));
  }

  // ── A case ──────────────────────────────────────────────────
  if (parts[0] === 'case' && parts[1]) {
    const c = await loadCase(env, parts[1]);
    if (!c) return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
    const back = (key, tab) => redirect(`/admin/case/${c.id}?${tab ? `tab=${tab}&` : ''}done=${key}`);

    if (parts.length === 2 && method === 'GET') {
      const tab = ['documents', 'filing', 'activity', 'records', 'billing'].includes(url.searchParams.get('tab')) ? url.searchParams.get('tab') : 'summary';
      // Everything below is independent: fetch it side by side (each database trip can be far away)
      audit(env, request, actor, 'case.viewed', 'case', c.id, { reference: c.reference });
      const open = isOpen(c.status) && !c.purged_at;
      const pendingDetails = c.kind === 'application' && open && awaitingDetails(c);
      const [[docs, events], uploadLink, detailsLink, badges, inv, bdocs, settings, archived] = await Promise.all([
        env.DB.batch([
          env.DB.prepare('SELECT id, file_name, size_bytes, uploaded_at FROM documents WHERE case_id = ?1 AND deleted_at IS NULL ORDER BY uploaded_at').bind(c.id),
          env.DB.prepare('SELECT event, from_status, to_status, note, actor, created_at FROM case_events WHERE case_id = ?1 ORDER BY id DESC').bind(c.id)
        ]),
        open ? uploadUrl(env, c.id, url.origin) : null,
        // A quick quote request has no details yet: offer the full details form instead of a long "missing" list
        pendingDetails ? detailsUrl(env, c.id, url.origin) : null,
        navBadges(env),
        tab === 'summary' ? env.DB.prepare("SELECT number, total, amount_paid, status FROM billing_docs WHERE case_id = ?1 AND kind = 'invoice' AND status != 'void' ORDER BY created_at DESC LIMIT 1").bind(c.id).first() : null,
        tab === 'billing' ? env.DB.prepare('SELECT * FROM billing_docs WHERE case_id = ?1 ORDER BY created_at DESC').bind(c.id).all() : null,
        tab === 'billing' ? billingSettings(env) : null,
        // Replaced or removed files are kept (marked deleted_at, file still in storage) until the case
        // itself is erased. Whether each was replaced or removed comes from the audit log.
        tab === 'documents' && !c.purged_at ? env.DB.prepare(
          `SELECT d.id, d.file_name, d.size_bytes, d.uploaded_at, d.deleted_at AS archived_at,
                  EXISTS(SELECT 1 FROM audit_log a WHERE a.action = 'document.replaced' AND a.entity_id = d.id) AS replaced
             FROM documents d WHERE d.case_id = ?1 AND d.deleted_at IS NOT NULL ORDER BY d.deleted_at DESC`).bind(c.id).all() : null
      ]);
      const missing = open && !pendingDetails ? missingForCase(c, docs.results || []) : null;
      const payment = inv ? { number: inv.number, total: inv.total, paid: inv.amount_paid || 0, balance: Math.max(0, inv.total - (inv.amount_paid || 0)), status: inv.status, money } : null;
      const billing = bdocs ? { docs: bdocs.results || [], settings, prefill: billPrefill(c, bdocs.results || [], url.searchParams.get('from')), kindLabel: KIND_LABEL, startPrices: START_PRICES, paymentMethods: PAYMENT_METHODS, money } : null;
      const archivedDocs = archived ? archived.results || [] : [];
      const pack = tab === 'filing' && !c.purged_at ? filingPack(c, docs.results || []) : null;
      return html(casePage({ admin, badges, c, tab, archivedDocs, docs: docs.results || [], events: events.results || [], flash, uploadLink, missing, billing, payment, detailsLink, pack }));
    }
    if (method !== 'POST') return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
    let form;
    try { form = await request.formData(); } catch (err) { console.error('case post: unreadable form:', err && err.message); return back('doc_unreadable', url.searchParams.get('tab') || 'documents'); }
    const now = new Date().toISOString();

    // Erased cases are read-only
    if (c.purged_at) return back('unchanged');

    if (parts[2] === 'details-edit') {
      if (c.purged_at) return back('unchanged');
      let fields = {};
      try { fields = JSON.parse(c.form_data || '{}') || {}; } catch (e) { /* start afresh */ }
      const changed = [];
      for (const f of BUSINESS_FIELDS) {
        const v = String(form.get(`f_${f.key.replace(/\s+/g, '_')}`) || '').trim().slice(0, f.type === 'textarea' ? 1500 : 300);
        if (v && v !== fields[f.key]) { fields[f.key] = v; changed.push(f.label.replace(/ \(.*\)$/, '')); }
      }
      if (!changed.length) return back('unchanged');
      await env.DB.batch([
        env.DB.prepare('UPDATE cases SET form_data = ?2, updated_at = ?3 WHERE id = ?1').bind(c.id, JSON.stringify(fields), now),
        env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'details_edited', ?2, ?3, ?4)").bind(c.id, `Entered by the office: ${changed.join(', ')}`, actor, now),
        auditStmt(env, request, actor, 'case.details_edited', 'case', c.id, { reference: c.reference, fields: changed }, now)
      ]);
      return back('details_saved');
    }
    if (parts[2] === 'service') {
      const service = String(form.get('service') || '');
      const step = String(form.get('step') || '');
      const note = String(form.get('note') || '').trim().slice(0, 300);
      const ref = String(form.get('ref') || '').trim().slice(0, 80);
      const services = String(c.services || '').split(',').map(x => x.trim());
      if (!services.includes(service) || !isStep(step) || c.purged_at) return back('unchanged');
      const events = (await env.DB.prepare("SELECT event, from_status, to_status, note, created_at FROM case_events WHERE case_id = ?1 AND event IN ('service_progress', 'service_ref')").bind(c.id).all()).results || [];
      const before = serviceProgress(c.services, events).find(r => r.service === service);
      const info = stepInfo(service, step);
      const stepChanged = !before || before.step !== step || !!note;
      const refChanged = ref !== (before ? before.reference : '');

      // Finished documents for the client (certificate, status report...): kept on the case,
      // named "delivered-<service>--<file>" so they are told apart from what the client sent us
      const slug = service.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      const files = form.getAll('files').filter(f => f && typeof f !== 'string' && f.size > 0);
      const stored = [];
      for (const f of files.slice(0, 6)) {
        const name = `delivered-${slug}--` + String(f.name || 'document').replace(/[\\/\r\n\0"]/g, '_').slice(0, 100);
        if (!DOC_EXT.test(name) || f.size > DOC_MAX || !(await fileMatchesName(name, f))) return back('service_file_bad');
        stored.push({ ...(await storeCaseDocument(env, c.id, name, f)), name, label: String(f.name || 'document') });
      }
      if (!stepChanged && !refChanged && !stored.length) return back('unchanged');

      const stmts = [];
      if (stepChanged) stmts.push(env.DB.prepare("INSERT INTO case_events (case_id, event, from_status, to_status, note, actor, created_at) VALUES (?1, 'service_progress', ?2, ?3, ?4, ?5, ?6)").bind(c.id, service, step, note || null, actor, now));
      if (refChanged) stmts.push(env.DB.prepare("INSERT INTO case_events (case_id, event, from_status, to_status, note, actor, created_at) VALUES (?1, 'service_ref', ?2, ?3, ?4, ?5, ?6)").bind(c.id, service, ref, `${service}: agency reference ${ref || 'cleared'}`, actor, now));
      for (const d of stored) stmts.push(d.stmt, auditStmt(env, request, actor, 'document.delivered', 'document', d.id, { reference: c.reference, file: d.name, service }, now));
      if (stored.length) stmts.push(env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'documents_added', ?2, ?3, ?4)").bind(c.id, `${service}: ${stored.map(d => d.label).join(', ')} added for the client`, actor, now));
      stmts.push(
        env.DB.prepare('UPDATE cases SET updated_at = ?2 WHERE id = ?1').bind(c.id, now),
        auditStmt(env, request, actor, 'case.service_progress', 'case', c.id, { reference: c.reference, service, step, ref: refChanged ? ref : undefined, files: stored.length || undefined }, now)
      );
      await env.DB.batch(stmts);

      const early = stepChanged && before && before.waitingFor.length && ['submitted', 'approved', 'delivered'].includes(step);
      if (form.get('notify') !== '1' || (!info.client && !stored.length)) return back(early ? 'service_early' : 'service_saved');
      if (!c.email || c.anonymised_at) return back('service_no_email');
      const documents = await Promise.all(stored.map(async d => ({ name: d.label, url: await deliveredUrl(env, d.id, url.origin) })));
      try {
        await sendBrevoEmail(env, {
          to: { email: c.email, name: c.full_name },
          subject: stored.length ? `Your documents are ready: ${service} (${c.reference})` : `Update on ${c.reference}: ${service}`,
          html: caseStatusEmail({
            fullName: c.full_name, reference: c.reference, statusLabel: `${service}: ${info.label}`,
            statusMessage: info.client || 'Your documents for this service are ready to download below.',
            note: [ref ? `Reference: ${ref}` : '', note].filter(Boolean).join('\n'), askForReview: ['approved', 'delivered'].includes(step), documents
          }),
          replyTo: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' }
        });
      } catch (err) { console.error('admin: service email failed:', err && err.message); return back('service_send_failed'); }
      return back('service_sent');
    }
    if (parts[2] === 'status') {
      const status = String(form.get('status') || '');
      const message = String(form.get('message') || '').trim().slice(0, 2000);
      const notify = form.get('notify') === '1';
      if (!statusesFor(c.kind).some(s => s.key === status)) return redirect(`/admin/case/${c.id}`);
      if (status === c.status && !message) return back('unchanged');

      const { closedAt, retainUntil } = retentionFor(c.kind, status, now);
      const statusChanged = status !== c.status;
      // Delivering a CAC or CERPAC case sets a renewal follow-up, unless one is already set
      const followUp = statusChanged && !c.follow_up_at ? autoFollowUp(c.services, status, now) : null;
      await env.DB.batch([
        env.DB.prepare(`UPDATE cases SET status = ?2, updated_at = ?3, closed_at = ?4, retain_until = ?5,
                          status_changed_at = CASE WHEN ?6 THEN ?3 ELSE status_changed_at END,
                          follow_up_at = COALESCE(?7, follow_up_at), follow_up_note = COALESCE(?8, follow_up_note)
                        WHERE id = ?1`)
          .bind(c.id, status, now, closedAt, retainUntil, statusChanged ? 1 : 0, followUp ? followUp.at : null, followUp ? followUp.note : null),
        env.DB.prepare("INSERT INTO case_events (case_id, event, from_status, to_status, note, actor, created_at) VALUES (?1, 'status_changed', ?2, ?3, ?4, ?5, ?6)")
          .bind(c.id, c.status, status, message || null, actor, now),
        auditStmt(env, request, actor, 'case.status_changed', 'case', c.id, { reference: c.reference, from: c.status, to: status }, now)
      ]);

      if (!notify) return back('status');
      if (!c.email || c.anonymised_at) return back('status_no_email');
      const info = statusInfo(c.kind, status);
      try {
        await sendBrevoEmail(env, {
          to: { email: c.email, name: c.full_name },
          subject: `Update on your request ${c.reference}: ${info.label}`,
          html: caseStatusEmail({ fullName: c.full_name, reference: c.reference, statusLabel: info.label, statusMessage: info.client, note: message, askForReview: status === 'delivered', uploadLink: status === 'awaiting_documents' ? await uploadUrl(env, c.id, url.origin) : null }),
          replyTo: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' }
        });
        await env.DB.prepare("INSERT INTO case_events (case_id, event, to_status, note, actor, created_at) VALUES (?1, 'client_notified', ?2, ?3, ?4, ?5)")
          .bind(c.id, status, `Emailed ${c.email}`, actor, new Date().toISOString()).run();
        return back('status_emailed');
      } catch (err) {
        console.error('admin: status email failed:', err && err.message);
        return back('status_email_failed');
      }
    }

    if (parts[2] === 'billing' && parts[3] === 'new') {
      const kind = form.get('kind') === 'invoice' ? 'invoice' : 'quote';
      const settings = await billingSettings(env);
      const raw = Array.from({ length: 20 }, (_, i) => ({ description: form.get(`desc_${i}`), detail: form.get(`detail_${i}`), timeline: form.get(`timeline_${i}`),
        qty: form.get(`qty_${i}`), unit: form.get(`unit_${i}`), gov: form.get(`gov_${i}`) === '1' }));
      const t = totals(raw.filter(r => r.description), settings.vatRegistered, {
        discount: form.get('discount'), target: form.get('discount_total'), label: form.get('discount_label') });
      if (!t.items.length) return redirect(`/admin/case/${c.id}?tab=billing&done=bill_empty#new`);
      const now = new Date().toISOString();
      const client = { name: String(form.get('name') || c.full_name).trim().slice(0, 160), address: String(form.get('address') || '').trim().slice(0, 300),
        tin: String(form.get('tin') || '').trim().slice(0, 40), phone: c.phone || '', email: c.email || '' };
      const doc = await createBillingDoc(env, request, actor, c, {
        kind, client, items: t.items, subtotal: t.subtotal, vat: t.vat, total: t.total, vatRate: t.vatRate,
        category: String(form.get('category') || '').trim().slice(0, 200), notes: String(form.get('notes') || '').trim().slice(0, 600),
        related: String(form.get('related') || '') || null,
        validUntil: kind === 'quote' ? addDays(now, 14) : null, dueAt: kind === 'invoice' ? addDays(now, 7) : null, issuedAt: now
      });
      if (kind === 'quote' && c.kind === 'application' && ['new'].includes(c.status)) {
        await env.DB.batch([
          env.DB.prepare("UPDATE cases SET status = 'quote_sent', updated_at = ?2, status_changed_at = ?2 WHERE id = ?1").bind(c.id, now),
          env.DB.prepare("INSERT INTO case_events (case_id, event, from_status, to_status, note, actor, created_at) VALUES (?1, 'status_changed', 'new', 'quote_sent', ?2, ?3, ?4)").bind(c.id, `Quotation ${doc.number}`, actor, now)
        ]);
      }
      if (form.get('send') === '1' && c.email) {
        try { await sendBillingDoc(env, request, url.origin, actor, c, await env.DB.prepare('SELECT * FROM billing_docs WHERE id = ?1').bind(doc.id).first()); }
        catch (err) { console.error('billing send:', err && err.message); return redirect(`/admin/case/${c.id}?tab=billing&done=bill_send_failed`); }
        return redirect(`/admin/case/${c.id}?tab=billing&done=bill_sent`);
      }
      return redirect(`/admin/case/${c.id}?tab=billing&done=bill_saved`);
    }

    if (parts[2] === 'request-missing') {
      if (!c.email || c.anonymised_at || !isOpen(c.status)) return back('unchanged');
      const docs = (await env.DB.prepare('SELECT file_name FROM documents WHERE case_id = ?1 AND deleted_at IS NULL').bind(c.id).all()).results || [];
      const m = missingForCase(c, docs);
      if (!m.details.length && !m.documents.length) return back('unchanged');
      const note = String(form.get('note') || '').trim().slice(0, 1000);
      try {
        await sendBrevoEmail(env, {
          to: { email: c.email, name: c.full_name },
          subject: `What we still need for ${c.reference}`,
          html: missingInfoEmail({ fullName: c.full_name, reference: c.reference, details: m.details, documents: m.documents, note, uploadLink: await uploadUrl(env, c.id, url.origin) }),
          replyTo: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' }
        });
      } catch (err) {
        console.error('admin: missing-info email failed:', err && err.message);
        return back('missing_failed');
      }
      const wait = form.get('wait') === '1' && c.kind === 'application' && c.status !== 'awaiting_documents';
      const stmts = [
        env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'info_requested', ?2, ?3, ?4)")
          .bind(c.id, `Asked for ${m.details.length} detail${m.details.length === 1 ? '' : 's'} and ${m.documents.length} document${m.documents.length === 1 ? '' : 's'}${note ? `. Message: ${note}` : ''}`, actor, now),
        auditStmt(env, request, actor, 'case.info_requested', 'case', c.id, { reference: c.reference, details: m.details.length, documents: m.documents.length }, now)
      ];
      if (wait) {
        stmts.push(env.DB.prepare("UPDATE cases SET status = 'awaiting_documents', updated_at = ?2, status_changed_at = ?2 WHERE id = ?1").bind(c.id, now));
        stmts.push(env.DB.prepare("INSERT INTO case_events (case_id, event, from_status, to_status, note, actor, created_at) VALUES (?1, 'status_changed', ?2, 'awaiting_documents', 'Waiting for the missing items', ?3, ?4)").bind(c.id, c.status, actor, now));
      }
      await env.DB.batch(stmts);
      return back('missing_sent');
    }

    if (parts[2] === 'details-link') {
      if (!c.email || c.kind !== 'application' || !isOpen(c.status) || c.purged_at) return back('details_failed');
      try {
        await sendBrevoEmail(env, {
          to: { email: c.email, name: c.full_name },
          subject: `Complete your application ${c.reference}`,
          html: detailsFormEmail({ fullName: c.full_name, reference: c.reference, services: c.services, link: await detailsUrl(env, c.id, url.origin), note: String(form.get('note') || '').trim().slice(0, 1000) }),
          replyTo: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' }
        });
      } catch (err) { console.error('admin: details-form email failed:', err && err.message); return back('details_failed'); }
      await env.DB.batch([
        env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'details_requested', ?2, ?3, ?4)").bind(c.id, `Emailed the full application form link to ${c.email}`, actor, now),
        env.DB.prepare('UPDATE cases SET updated_at = ?2 WHERE id = ?1').bind(c.id, now),
        auditStmt(env, request, actor, 'case.details_requested', 'case', c.id, { reference: c.reference }, now)
      ]);
      return back('details_sent');
    }
    if (parts[2] === 'doc-add') {
      if (c.purged_at) return back('doc_bad', 'documents');
      const f = form.get('file');
      const what = String(form.get('what') || '').trim().slice(0, 80);
      const prefix = what ? what.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '--' : 'added-by-office--';
      const name = f && typeof f !== 'string' ? prefix + String(f.name || 'file').replace(/[\\/\r\n\0"]/g, '_').slice(0, 100) : '';
      if (!name || !DOC_EXT.test(name) || f.size <= 0 || f.size > DOC_MAX || !(await fileMatchesName(name, f))) return back('doc_bad', 'documents');
      const doc = await storeCaseDocument(env, c.id, name, f);
      await env.DB.batch([
        doc.stmt,
        env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'documents_added', ?2, ?3, ?4)").bind(c.id, `Added ${name}`, actor, now),
        env.DB.prepare('UPDATE cases SET updated_at = ?2 WHERE id = ?1').bind(c.id, now),
        auditStmt(env, request, actor, 'document.added', 'document', doc.id, { reference: c.reference, file: name }, now)
      ]);
      return back('doc_added', 'documents');
    }
    if (parts[2] === 'note') {
      const note = String(form.get('note') || '').trim().slice(0, 2000);
      if (!note) return redirect(`/admin/case/${c.id}?tab=activity`);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'note', ?2, ?3, ?4)").bind(c.id, note, actor, now),
        auditStmt(env, request, actor, 'case.note_added', 'case', c.id, { reference: c.reference }, now),
        // Activity on an enquiry restarts its 12-month retention clock
        c.kind === 'enquiry'
          ? env.DB.prepare('UPDATE cases SET updated_at = ?2, retain_until = ?3 WHERE id = ?1').bind(c.id, now, retentionFor('enquiry', c.status, now).retainUntil)
          : env.DB.prepare('UPDATE cases SET updated_at = ?2 WHERE id = ?1').bind(c.id, now)
      ]);
      return back('note', 'activity');
    }

    if (parts[2] === 'followup') {
      const clear = form.get('clear') === '1';
      const date = String(form.get('date') || '');
      const note = String(form.get('note') || '').trim().slice(0, 500);
      // Due at 8am Lagos time on the chosen day
      const due = new Date(`${date}T07:00:00.000Z`);
      if (!clear && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(due.getTime()))) return back('followup_invalid');
      await env.DB.batch([
        env.DB.prepare('UPDATE cases SET follow_up_at = ?2, follow_up_note = ?3, updated_at = ?4 WHERE id = ?1')
          .bind(c.id, clear ? null : due.toISOString(), clear ? null : (note || null), now),
        env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'follow_up', ?2, ?3, ?4)")
          .bind(c.id, clear ? 'Follow-up cleared' : `Follow-up set for ${date}${note ? `: ${note}` : ''}`, actor, now),
        auditStmt(env, request, actor, 'case.follow_up_set', 'case', c.id, { reference: c.reference, date: clear ? null : date }, now)
      ]);
      return back(clear ? 'followup_cleared' : 'followup');
    }

    if (parts[2] === 'hold') {
      const on = form.get('on') === '1';
      const reason = String(form.get('reason') || '').trim().slice(0, 300);
      if (on && !reason) return back('hold_reason', 'records');
      await env.DB.batch([
        env.DB.prepare('UPDATE cases SET legal_hold = ?2, legal_hold_reason = ?3, updated_at = ?4 WHERE id = ?1').bind(c.id, on ? 1 : 0, on ? reason : null, now),
        env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'legal_hold', ?2, ?3, ?4)")
          .bind(c.id, on ? `Legal hold placed: ${reason}` : 'Legal hold released', actor, now),
        auditStmt(env, request, actor, 'case.legal_hold', 'case', c.id, { reference: c.reference, on, reason: on ? reason : null }, now)
      ]);
      return back(on ? 'hold_on' : 'hold_off', 'records');
    }

    if (parts[2] === 'erase') {
      const early = form.get('mode') === 'early';
      if (form.get('confirm') !== '1' || String(form.get('confirm_ref') || '').trim().toUpperCase() !== c.reference) return back('erase_confirm', 'records');
      if (eraseBlocker(c, now, early)) return back('erase_blocked', 'records');
      const reason = early ? (EARLY_ERASE_REASONS[form.get('reason')] || null) : 'Retention period ended';
      if (!reason) return back('erase_blocked', 'records');
      await eraseCase(env, c, { actor, reason, ip });
      return back('erased', 'records');
    }
    return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
  }

  // ── Documents ───────────────────────────────────────────────
  if (parts[0] === 'doc' && parts[1] && parts.length === 3 && method === 'POST' && ['replace', 'remove'].includes(parts[2])) {
    const d = await env.DB.prepare(
      'SELECT d.id, d.case_id, d.file_name, d.storage_key, c.reference FROM documents d JOIN cases c ON c.id = d.case_id WHERE d.id = ?1 AND d.deleted_at IS NULL'
    ).bind(parts[1]).first();
    if (!d) return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
    const backDocs = key => redirect(`/admin/case/${d.case_id}?tab=documents&done=${key}`);
    const now = new Date().toISOString();
    const stmts = [];
    let note;
    if (parts[2] === 'replace') {
      let f = null;
      try { f = (await request.formData()).get('file'); } catch (err) { console.error('doc replace: unreadable upload:', err && err.message); return backDocs('doc_unreadable'); }
      if (!f || typeof f === 'string' || f.size <= 0 || f.size > DOC_MAX) return backDocs('doc_bad');
      const ext = (String(f.name || '').match(DOC_EXT) || [])[0];
      if (!ext || !(await fileMatchesName(String(f.name), f))) return backDocs('doc_bad');
      // Keep the original name (signatures are matched to people by it); only the extension follows the new file
      const name = d.file_name.replace(/\.[a-z0-9]+$/i, '') + ext.toLowerCase();
      const doc = await storeCaseDocument(env, d.case_id, name, f);
      stmts.push(doc.stmt);
      note = `Replaced ${d.file_name}${name !== d.file_name ? ` with ${name}` : ''}. The old file is kept under Earlier and removed files.`;
      stmts.push(auditStmt(env, request, actor, 'document.replaced', 'document', d.id, { reference: d.reference, file: d.file_name, replacement: doc.id }, now));
    } else {
      note = `Removed ${d.file_name} from the current documents. The file is kept under Earlier and removed files.`;
      stmts.push(auditStmt(env, request, actor, 'document.removed', 'document', d.id, { reference: d.reference, file: d.file_name }, now));
    }
    stmts.push(env.DB.prepare('UPDATE documents SET deleted_at = ?2 WHERE id = ?1').bind(d.id, now));
    stmts.push(env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(d.case_id, parts[2] === 'replace' ? 'document_replaced' : 'document_removed', note, actor, now));
    stmts.push(env.DB.prepare('UPDATE cases SET updated_at = ?2 WHERE id = ?1').bind(d.case_id, now));
    await env.DB.batch(stmts);
    // The old file is not deleted from storage: it is kept for the record
    return backDocs(parts[2] === 'replace' ? 'doc_replaced' : 'doc_removed');
  }
  if (parts[0] === 'doc' && parts[1] && parts.length === 2 && method === 'GET') {
    const d = await env.DB.prepare(
      'SELECT d.id, d.file_name, d.storage_key, c.reference FROM documents d JOIN cases c ON c.id = d.case_id WHERE d.id = ?1 AND (d.deleted_at IS NULL OR c.purged_at IS NULL)'
    ).bind(parts[1]).first();
    const obj = d ? await env.DOCS.get(d.storage_key) : null;
    if (!obj) return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
    await audit(env, request, actor, 'document.viewed', 'document', d.id, { reference: d.reference, file: d.file_name });
    // ?download=<portal name> saves it under the filing pack's name (same file type only)
    const wanted = String(url.searchParams.get('download') || '').slice(0, 120);
    const ext = s => (/\.([a-z0-9]+)$/i.exec(s) || [, ''])[1].toLowerCase().replace('jpeg', 'jpg');
    const asName = wanted && /^[A-Za-z0-9._ -]+$/.test(wanted) && ext(wanted) === ext(d.file_name) ? wanted : d.file_name;
    const safeName = asName.replace(/["\\\r\n]/g, '_');
    return new Response(obj.body, {
      headers: {
        ...SECURITY_HEADERS,
        // Type comes from the file extension only, so an upload can never run as a web page
        'Content-Type': documentContentType(d.file_name),
        'Content-Disposition': `${asName !== d.file_name ? 'attachment' : 'inline'}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(asName)}`,
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'none'"
      }
    });
  }

  // ── Clients ─────────────────────────────────────────────────
  if (route === '/clients' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    const rows = (await env.DB.prepare(
      `SELECT cl.id, cl.full_name, cl.email, cl.phone,
              (SELECT COUNT(*) FROM cases c WHERE c.client_id = cl.id) AS cases,
              (SELECT MAX(c.updated_at) FROM cases c WHERE c.client_id = cl.id) AS last_activity
       FROM clients cl
       ${q ? "WHERE cl.full_name LIKE ?1 ESCAPE '\\' OR cl.email LIKE ?1 ESCAPE '\\' OR cl.phone LIKE ?1 ESCAPE '\\'" : ''}
       ORDER BY last_activity DESC LIMIT 300`
    ).bind(...(q ? [likePattern(q)] : [])).all()).results || [];
    return html(clientsPage({ admin, badges: await navBadges(env), rows, q }));
  }

  if (parts[0] === 'client' && parts[1]) {
    const client = await env.DB.prepare('SELECT * FROM clients WHERE id = ?1').bind(parts[1]).first();
    if (!client) return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
    const back = key => redirect(`/admin/client/${client.id}?done=${key}`);
    const now = new Date().toISOString();
    const cases = (await env.DB.prepare(
      'SELECT * FROM cases WHERE client_id = ?1 ORDER BY created_at DESC'
    ).bind(client.id).all()).results || [];
    // Erasing a client is only allowed once none of their records must be kept
    const blockers = cases.map(c => { const b = eraseBlocker(c, now); return b && !c.purged_at ? `${c.reference}: ${b}` : null; }).filter(Boolean);

    if (parts.length === 2 && method === 'GET') {
      const requests = (await env.DB.prepare('SELECT * FROM data_requests WHERE client_id = ?1 ORDER BY received_at DESC').bind(client.id).all()).results || [];
      await audit(env, request, actor, 'client.viewed', 'client', client.id, null);
      return html(clientPage({ admin, badges: await navBadges(env), client, cases, requests, eraseCheck: { blockers }, flash }));
    }

    if (parts[2] === 'export' && method === 'GET') {
      const data = await exportClient(env, client.id);
      const openAccess = await env.DB.prepare("SELECT id FROM data_requests WHERE client_id = ?1 AND kind = 'access' AND completed_at IS NULL ORDER BY received_at LIMIT 1").bind(client.id).first();
      await env.DB.batch([
        auditStmt(env, request, actor, 'client.exported', 'client', client.id, { cases: cases.length }, now),
        openAccess
          ? env.DB.prepare("UPDATE data_requests SET completed_at = ?2, outcome = 'Data exported' WHERE id = ?1").bind(openAccess.id, now)
          : env.DB.prepare("INSERT INTO data_requests (id, client_id, kind, received_at, completed_at, outcome, created_by) VALUES (?1, ?2, 'access', ?3, ?3, 'Data exported', ?4)")
            .bind(crypto.randomUUID(), client.id, now, actor)
      ]);
      const name = `client-data-${(client.full_name || 'client').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${now.slice(0, 10)}.json`;
      return new Response(JSON.stringify(data, null, 2), {
        headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` }
      });
    }

    if (method !== 'POST') return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
    const form = await request.formData();

    if (parts[2] === 'update' && !client.anonymised_at) {
      const fullName = String(form.get('full_name') || '').trim().slice(0, 120);
      const email = String(form.get('email') || '').trim().toLowerCase().slice(0, 254) || null;
      const phone = String(form.get('phone') || '').trim().slice(0, 40) || null;
      if (!fullName || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) return back('client_invalid');
      const changed = ['full_name', 'email', 'phone'].filter(k => (client[k] || null) !== ({ full_name: fullName, email, phone })[k]);
      await env.DB.batch([
        env.DB.prepare('UPDATE clients SET full_name = ?2, email = ?3, phone = ?4, updated_at = ?5 WHERE id = ?1').bind(client.id, fullName, email, phone, now),
        // Only the names of the changed fields are logged, not the values
        auditStmt(env, request, actor, 'client.updated', 'client', client.id, { changed }, now)
      ]);
      return back('client_updated');
    }

    if (parts[2] === 'request') {
      const kind = String(form.get('kind') || '');
      const received = String(form.get('received') || '');
      const note = String(form.get('note') || '').trim().slice(0, 500) || null;
      if (!['access', 'correction', 'erasure', 'objection', 'other'].includes(kind)) return back('unchanged');
      const receivedAt = /^\d{4}-\d{2}-\d{2}$/.test(received) && !Number.isNaN(new Date(received).getTime()) ? new Date(`${received}T12:00:00Z`).toISOString() : now;
      const id = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare('INSERT INTO data_requests (id, client_id, kind, received_at, note, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(id, client.id, kind, receivedAt, note, actor),
        auditStmt(env, request, actor, 'client.request_logged', 'client', client.id, { kind }, now)
      ]);
      return back('request_logged');
    }

    if (parts[2] === 'erase') {
      if (form.get('confirm') !== '1' || String(form.get('confirm_name') || '').trim().toLowerCase() !== String(client.full_name).trim().toLowerCase()) return back('erase_confirm');
      if (blockers.length) return back('client_erase_blocked');
      let files = 0;
      for (const c of cases.filter(c => !c.purged_at)) {
        files += await eraseCase(env, c, { actor, reason: 'Client erasure request', ip });
      }
      const openErasure = await env.DB.prepare("SELECT id FROM data_requests WHERE client_id = ?1 AND kind = 'erasure' AND completed_at IS NULL ORDER BY received_at LIMIT 1").bind(client.id).first();
      await env.DB.batch([
        // Covers clients whose cases were all erased earlier (eraseCase anonymises the client on the last case)
        env.DB.prepare("UPDATE clients SET full_name = 'Erased client', email = NULL, phone = NULL, anonymised_at = COALESCE(anonymised_at, ?2), updated_at = ?2 WHERE id = ?1").bind(client.id, now),
        auditStmt(env, request, actor, 'client.erased', 'client', client.id, { cases: cases.length, documents: files }, now),
        openErasure
          ? env.DB.prepare("UPDATE data_requests SET completed_at = ?2, outcome = 'Erased' WHERE id = ?1").bind(openErasure.id, now)
          : env.DB.prepare("INSERT INTO data_requests (id, client_id, kind, received_at, completed_at, outcome, created_by) VALUES (?1, ?2, 'erasure', ?3, ?3, 'Erased', ?4)")
            .bind(crypto.randomUUID(), client.id, now, actor)
      ]);
      return back('client_erased');
    }
    return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
  }

  if (parts[0] === 'request' && parts[1] && parts[2] === 'done' && method === 'POST') {
    const r = await env.DB.prepare('SELECT id, client_id, kind FROM data_requests WHERE id = ?1').bind(parts[1]).first();
    if (!r) return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE data_requests SET completed_at = COALESCE(completed_at, ?2), outcome = COALESCE(outcome, 'Handled') WHERE id = ?1").bind(r.id, now),
      auditStmt(env, request, actor, 'client.request_done', 'client', r.client_id, { kind: r.kind }, now)
    ]);
    return redirect(`/admin/client/${r.client_id}?done=request_done`);
  }

  // ── Records ─────────────────────────────────────────────────
  // ── Filing assistant (browser extension) connection keys ─────
  if (route === '/extension' && method === 'GET') {
    return html(extensionPage({ admin, badges: await navBadges(env), flash, keys: await listKeys(env), newKey: null }));
  }
  if (route === '/extension/key' && method === 'POST') {
    const form = await request.formData();
    const { key, rec } = await createKey(env, admin, String(form.get('label') || '').trim() || 'Browser');
    await audit(env, request, actor, 'extension.key_created', 'admin', admin, { id: rec.id, label: rec.label });
    return html(extensionPage({ admin, badges: await navBadges(env), flash: null, keys: await listKeys(env), newKey: { key, label: rec.label } }));
  }
  if (route === '/extension/revoke' && method === 'POST') {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    if (await revokeKey(env, id)) await audit(env, request, actor, 'extension.key_revoked', 'admin', admin, { id });
    return redirect('/admin/extension?done=ext_revoked');
  }

  if (route === '/records' && method === 'GET') {
    const now = new Date().toISOString();
    const [due, holds, requests, stats] = await env.DB.batch([
      env.DB.prepare(`SELECT c.id, c.reference, c.retain_until, cl.full_name FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE ${REVIEW_SQL} ORDER BY c.retain_until`).bind(now),
      env.DB.prepare('SELECT c.id, c.reference, c.legal_hold_reason, cl.full_name FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE c.legal_hold = 1 ORDER BY c.updated_at DESC'),
      env.DB.prepare('SELECT r.*, cl.full_name FROM data_requests r LEFT JOIN clients cl ON cl.id = r.client_id WHERE r.completed_at IS NULL ORDER BY r.received_at'),
      env.DB.prepare('SELECT SUM(purged_at IS NULL) AS kept, SUM(purged_at IS NOT NULL) AS erased FROM cases')
    ]);
    const s = (stats.results || [])[0] || {};
    const lastRun = await env.DB.prepare("SELECT run_date, detail FROM job_runs WHERE job = 'daily' AND detail IS NOT NULL ORDER BY run_date DESC LIMIT 1").first();
    let backupStatus = null;
    try { backupStatus = lastRun ? { date: lastRun.run_date, ...JSON.parse(lastRun.detail) } : null; } catch (e) {}
    return html(recordsPage({
      signIns: await recentSignIns(env, new Date(Date.now() - 14 * 86400000).toISOString(), 8), backupStatus,
      bounceOn: !!(await bounceSettings(env).catch(() => null)),
      subjects: { recent: await dataSubjectCount(env, new Date(Date.now() - 183 * 86400000).toISOString()), all: await dataSubjectCount(env) },
      admin, badges: await navBadges(env), due: due.results || [], holds: holds.results || [], requests: requests.results || [],
      backups: await listBackups(env), stats: { kept: s.kept || 0, erased: s.erased || 0 }, flash
    }));
  }

  if (parts[0] === 'backup' && parts[1] && method === 'GET') {
    const key = `backups/${parts[1]}.json`;
    const obj = isBackupKey(key) ? await env.DOCS.get(key) : null;
    if (!obj) return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
    await audit(env, request, actor, 'backup.downloaded', 'backup', parts[1], null);
    return new Response(obj.body, {
      headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="awal-cases-backup-${parts[1]}.json"` }
    });
  }

  // ── Activity log ────────────────────────────────────────────
  if (route === '/activity' && method === 'GET') {
    const filter = ACTIVITY_FILTERS.find(f => f.key === url.searchParams.get('filter')) || ACTIVITY_FILTERS[0];
    const before = Number.parseInt(url.searchParams.get('before') || '', 10);
    const conds = [];
    const args = [];
    if (filter.prefix) { args.push(`${filter.prefix}%`); conds.push(`action LIKE ?${args.length}`); }
    if (filter.key === 'login') conds[conds.length - 1] = `(${conds[conds.length - 1]} OR action = 'logout')`;
    if (filter.key === 'client') conds[conds.length - 1] = `(${conds[conds.length - 1]} OR action = 'backup.downloaded')`;
    if (Number.isFinite(before)) { args.push(before); conds.push(`id < ?${args.length}`); }
    const pageSize = 50;
    const rows = (await env.DB.prepare(
      `SELECT id, at, actor, action, entity_type, entity_id, detail FROM audit_log ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ${pageSize + 1}`
    ).bind(...args).all()).results || [];
    const more = rows.length > pageSize;
    const shown = rows.slice(0, pageSize);
    return html(activityPage({ admin, badges: await navBadges(env), rows: shown, filter: filter.key, nextBefore: more ? shown[shown.length - 1].id : null }));
  }

  return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
}
