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
  loginPage, overviewPage, casesPage, casePage, clientsPage, clientPage, recordsPage, activityPage,
  notFoundPage, simplePage, flashFor, CASE_VIEWS, ACTIVITY_FILTERS
} from '../_lib/admin-views.js';
import { statusesFor, statusInfo, retentionFor, documentContentType, autoFollowUp } from '../_lib/cases.js';
import { EARLY_ERASE_REASONS, eraseBlocker, eraseCase, exportClient, listBackups, isBackupKey } from '../_lib/compliance.js';
import { sendBrevoEmail } from '../_lib/brevo.js';
import { adminLoginCodeEmail, caseStatusEmail } from '../_lib/email-templates.js';

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin', // not no-referrer: that makes browsers send "Origin: null" on form posts
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
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

async function audit(env, request, actor, action, entityType, entityId, detail) {
  await env.DB.prepare(
    'INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
  ).bind(new Date().toISOString(), actor, action, entityType, entityId, detail ? JSON.stringify(detail) : null,
    request.headers.get('CF-Connecting-IP')).run();
}

function auditStmt(env, request, actor, action, entityType, entityId, detail, at) {
  return env.DB.prepare(
    'INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
  ).bind(at, actor, action, entityType, entityId, detail ? JSON.stringify(detail) : null, request.headers.get('CF-Connecting-IP'));
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

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.DB || !env.DOCS) return html(simplePage('Not connected', 'The records database is not connected to this site.'), 503);

  const url = new URL(request.url);
  const parts = [].concat(params.path || []).filter(Boolean);
  const route = '/' + parts.join('/');
  const method = request.method;

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
          const cookie = await createSession(env, request, email);
          await audit(env, request, `admin:${email}`, 'login.success', 'admin', email);
          return redirect(next, { 'Set-Cookie': cookie });
        }
        if (isAdminEmail(env, email)) await audit(env, request, `admin:${email}`, 'login.failed', 'admin', email);
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

  if (route === '/logout' && method === 'POST') {
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
      admin, badges: { cases: s.newCount || 0, records: reviewN + requestN },
      stats: { newCount: s.newCount || 0, waiting: s.waiting || 0, inProgress: s.inProgress || 0, followUpsDue: s.followUpsDue || 0 },
      needsReply: needs.results || [], followUps: follow.results || [], waiting: waiting.results || [], recent: recent.results || [], alerts
    }));
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
      const tab = ['documents', 'activity', 'records'].includes(url.searchParams.get('tab')) ? url.searchParams.get('tab') : 'summary';
      const [docs, events] = await env.DB.batch([
        env.DB.prepare('SELECT id, file_name, size_bytes, uploaded_at FROM documents WHERE case_id = ?1 AND deleted_at IS NULL ORDER BY uploaded_at').bind(c.id),
        env.DB.prepare('SELECT event, from_status, to_status, note, actor, created_at FROM case_events WHERE case_id = ?1 ORDER BY id DESC').bind(c.id)
      ]);
      await audit(env, request, actor, 'case.viewed', 'case', c.id, { reference: c.reference });
      return html(casePage({ admin, badges: await navBadges(env), c, tab, docs: docs.results || [], events: events.results || [], flash }));
    }
    if (method !== 'POST') return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
    const form = await request.formData();
    const now = new Date().toISOString();

    // Erased cases are read-only
    if (c.purged_at) return back('unchanged');

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
          html: caseStatusEmail({ fullName: c.full_name, reference: c.reference, statusLabel: info.label, statusMessage: info.client, note: message }),
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
  if (parts[0] === 'doc' && parts[1] && parts.length === 2 && method === 'GET') {
    const d = await env.DB.prepare(
      'SELECT d.id, d.file_name, d.storage_key, c.reference FROM documents d JOIN cases c ON c.id = d.case_id WHERE d.id = ?1 AND d.deleted_at IS NULL'
    ).bind(parts[1]).first();
    const obj = d ? await env.DOCS.get(d.storage_key) : null;
    if (!obj) return html(notFoundPage({ admin, badges: await navBadges(env) }), 404);
    await audit(env, request, actor, 'document.viewed', 'document', d.id, { reference: d.reference, file: d.file_name });
    const safeName = d.file_name.replace(/["\\\r\n]/g, '_');
    return new Response(obj.body, {
      headers: {
        ...SECURITY_HEADERS,
        // Type comes from the file extension only, so an upload can never run as a web page
        'Content-Type': documentContentType(d.file_name),
        'Content-Disposition': `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(d.file_name)}`,
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
  if (route === '/records' && method === 'GET') {
    const now = new Date().toISOString();
    const [due, holds, requests, stats] = await env.DB.batch([
      env.DB.prepare(`SELECT c.id, c.reference, c.retain_until, cl.full_name FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE ${REVIEW_SQL} ORDER BY c.retain_until`).bind(now),
      env.DB.prepare('SELECT c.id, c.reference, c.legal_hold_reason, cl.full_name FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE c.legal_hold = 1 ORDER BY c.updated_at DESC'),
      env.DB.prepare('SELECT r.*, cl.full_name FROM data_requests r LEFT JOIN clients cl ON cl.id = r.client_id WHERE r.completed_at IS NULL ORDER BY r.received_at'),
      env.DB.prepare('SELECT SUM(purged_at IS NULL) AS kept, SUM(purged_at IS NOT NULL) AS erased FROM cases')
    ]);
    const s = (stats.results || [])[0] || {};
    return html(recordsPage({
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
