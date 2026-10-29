/**
 * Admin dashboard: /admin
 *
 *   GET  /admin/login            sign-in page (email → one-time code)
 *   POST /admin/login            send code / verify code
 *   POST /admin/logout
 *   GET  /admin/                 case list (?view=open|new|closed|all, ?q=search)
 *   GET  /admin/case/:id         case details
 *   POST /admin/case/:id/status  change status (optionally emails the client)
 *   POST /admin/case/:id/note    add a private note
 *   GET  /admin/doc/:id          view an uploaded document
 *
 * Every page except sign-in requires a session (see _lib/admin-auth.js).
 * Viewing a case or document, status changes, notes, and sign-ins are written
 * to the audit log.
 */
import { createLoginCode, verifyLoginCode, createSession, currentAdmin, endSession, isAdminEmail } from '../_lib/admin-auth.js';
import { loginPage, listPage, casePage, notFoundPage, page, VIEWS } from '../_lib/admin-views.js';
import { statusesFor, statusInfo, retentionFor, documentContentType } from '../_lib/cases.js';
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
const VIEW_SQL = {
  open: OPEN_SQL,
  new: "c.status = 'new'",
  closed: `NOT (${OPEN_SQL})`,
  all: '1 = 1'
};

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

async function audit(env, request, actor, action, entityType, entityId, detail) {
  await env.DB.prepare(
    'INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
  ).bind(new Date().toISOString(), actor, action, entityType, entityId, detail ? JSON.stringify(detail) : null,
    request.headers.get('CF-Connecting-IP')).run();
}

async function loadCase(env, id) {
  return env.DB.prepare(
    `SELECT c.*, cl.full_name, cl.email, cl.phone, cl.anonymised_at
     FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE c.id = ?1`
  ).bind(id).first();
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.DB || !env.DOCS) {
    return html(page('Not connected', '<div class="card">The records database is not connected to this site.</div>'), 503);
  }

  const url = new URL(request.url);
  const parts = [].concat(params.path || []);
  const route = '/' + parts.join('/');
  const method = request.method;

  // Form posts must come from this site (blocks cross-site request forgery)
  if (method === 'POST' && request.headers.get('Origin') !== url.origin) {
    return html(page('Blocked', '<div class="card">This request was blocked for security reasons. Please go back and try again.</div>'), 403);
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
        return html(loginPage({ step: 'code', email, next, error: 'That code is wrong or has expired. Check the latest email, or start again for a new code.' }), 401);
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

  if (route === '/logout' && method === 'POST') {
    const cookie = await endSession(env, request);
    await audit(env, request, actor, 'logout', 'admin', admin);
    return redirect('/admin/login', { 'Set-Cookie': cookie });
  }

  // ── Case list ───────────────────────────────────────────────
  if ((route === '/' || route === '') && method === 'GET') {
    const view = VIEW_SQL[url.searchParams.get('view')] ? url.searchParams.get('view') : 'open';
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    const like = `%${q.replace(/[%_\\]/g, m => '\\' + m)}%`;
    const searchSql = q
      ? " AND (c.reference LIKE ?1 ESCAPE '\\' OR cl.full_name LIKE ?1 ESCAPE '\\' OR cl.email LIKE ?1 ESCAPE '\\' OR cl.phone LIKE ?1 ESCAPE '\\' OR c.services LIKE ?1 ESCAPE '\\')"
      : '';
    const bindArgs = q ? [like] : [];

    const listStmt = env.DB.prepare(
      `SELECT c.id, c.reference, c.kind, c.services, c.status, c.created_at, cl.full_name,
              (SELECT COUNT(*) FROM documents d WHERE d.case_id = c.id AND d.deleted_at IS NULL) AS docs
       FROM cases c JOIN clients cl ON cl.id = c.client_id
       WHERE ${VIEW_SQL[view]}${searchSql}
       ORDER BY c.created_at DESC LIMIT 200`
    ).bind(...bindArgs);
    const countStmt = env.DB.prepare(
      `SELECT ${VIEWS.map(v => `SUM(CASE WHEN ${VIEW_SQL[v.key]} THEN 1 ELSE 0 END) AS "${v.key}"`).join(', ')}
       FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE 1 = 1${searchSql}`
    ).bind(...bindArgs);

    const [list, counts] = await env.DB.batch([listStmt, countStmt]);
    return html(listPage({ rows: list.results || [], view, q, counts: (counts.results || [])[0] || {} }));
  }

  // ── Case details and actions ────────────────────────────────
  if (parts[0] === 'case' && parts[1]) {
    const c = await loadCase(env, parts[1]);
    if (!c) return html(notFoundPage(), 404);

    if (parts.length === 2 && method === 'GET') {
      const [docs, events] = await env.DB.batch([
        env.DB.prepare('SELECT id, file_name, size_bytes, uploaded_at FROM documents WHERE case_id = ?1 AND deleted_at IS NULL ORDER BY uploaded_at').bind(c.id),
        env.DB.prepare('SELECT event, from_status, to_status, note, created_at FROM case_events WHERE case_id = ?1 ORDER BY id DESC').bind(c.id)
      ]);
      await audit(env, request, actor, 'case.viewed', 'case', c.id, { reference: c.reference });
      return html(casePage({ c, docs: docs.results || [], events: events.results || [], flash: url.searchParams.get('done') }));
    }

    if (parts[2] === 'status' && method === 'POST') {
      const form = await request.formData();
      const status = String(form.get('status') || '');
      const message = String(form.get('message') || '').trim().slice(0, 2000);
      const notify = form.get('notify') === '1';
      if (!statusesFor(c.kind).some(s => s.key === status)) return redirect(`/admin/case/${c.id}`);
      if (status === c.status && !message) return redirect(`/admin/case/${c.id}?done=unchanged`);

      const now = new Date().toISOString();
      const { closedAt, retainUntil } = retentionFor(c.kind, status, now);
      await env.DB.batch([
        env.DB.prepare('UPDATE cases SET status = ?2, updated_at = ?3, closed_at = ?4, retain_until = ?5 WHERE id = ?1')
          .bind(c.id, status, now, closedAt, retainUntil),
        env.DB.prepare("INSERT INTO case_events (case_id, event, from_status, to_status, note, actor, created_at) VALUES (?1, 'status_changed', ?2, ?3, ?4, ?5, ?6)")
          .bind(c.id, c.status, status, message || null, actor, now),
        env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, ?2, 'case.status_changed', 'case', ?3, ?4, ?5)")
          .bind(now, actor, c.id, JSON.stringify({ reference: c.reference, from: c.status, to: status }), request.headers.get('CF-Connecting-IP'))
      ]);

      if (!notify) return redirect(`/admin/case/${c.id}?done=status`);
      if (!c.email || c.anonymised_at) return redirect(`/admin/case/${c.id}?done=status_no_email`);

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
        return redirect(`/admin/case/${c.id}?done=status_emailed`);
      } catch (err) {
        console.error('admin: status email failed:', err && err.message);
        return redirect(`/admin/case/${c.id}?done=status_email_failed`);
      }
    }

    if (parts[2] === 'note' && method === 'POST') {
      const form = await request.formData();
      const note = String(form.get('note') || '').trim().slice(0, 2000);
      if (!note) return redirect(`/admin/case/${c.id}`);
      const now = new Date().toISOString();
      const statements = [
        env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'note', ?2, ?3, ?4)")
          .bind(c.id, note, actor, now),
        env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, ?2, 'case.note_added', 'case', ?3, ?4, ?5)")
          .bind(now, actor, c.id, JSON.stringify({ reference: c.reference }), request.headers.get('CF-Connecting-IP'))
      ];
      // Activity on an enquiry restarts its 12-month retention clock
      statements.push(c.kind === 'enquiry'
        ? env.DB.prepare('UPDATE cases SET updated_at = ?2, retain_until = ?3 WHERE id = ?1').bind(c.id, now, retentionFor('enquiry', c.status, now).retainUntil)
        : env.DB.prepare('UPDATE cases SET updated_at = ?2 WHERE id = ?1').bind(c.id, now));
      await env.DB.batch(statements);
      return redirect(`/admin/case/${c.id}?done=note`);
    }
  }

  // ── Documents ───────────────────────────────────────────────
  if (parts[0] === 'doc' && parts[1] && parts.length === 2 && method === 'GET') {
    const d = await env.DB.prepare(
      'SELECT d.id, d.file_name, d.storage_key, c.id AS case_id, c.reference FROM documents d JOIN cases c ON c.id = d.case_id WHERE d.id = ?1 AND d.deleted_at IS NULL'
    ).bind(parts[1]).first();
    const obj = d ? await env.DOCS.get(d.storage_key) : null;
    if (!obj) return html(notFoundPage(), 404);

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

  return html(notFoundPage(), 404);
}
