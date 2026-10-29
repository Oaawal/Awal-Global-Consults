/**
 * HTML for the admin dashboard (/admin). Server-rendered, phone-first, and
 * script-free: every action is a plain form post.
 */
import { statusesFor, statusInfo, isOpen, whatsappLink } from './cases.js';

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function fmtDay(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const STYLE = `
:root{--navy:#0F3A5F;--navy-dark:#0A2C48;--blue:#2F80ED;--bg:#F4F8FC;--line:#D7E6F2;--text:#222;--muted:#5b6670;--ok:#1e6b46;--warn:#a05a00;--err:#c0392b}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
a{color:var(--navy)}
header{background:var(--navy-dark);color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:0;z-index:5}
header a{color:#fff;text-decoration:none;font-weight:700}
header form{margin:0}
header button{background:transparent;color:#cfe3f7;border:1px solid rgba(255,255,255,.35);border-radius:8px;padding:6px 10px;font-size:13px}
main{max-width:760px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:4px 0 12px;color:var(--navy)}
h2{font-size:15px;margin:0 0 10px;color:var(--navy);text-transform:uppercase;letter-spacing:.5px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
.tabs{display:flex;gap:6px;overflow-x:auto;margin-bottom:10px;padding-bottom:2px}
.tabs a{flex:none;padding:7px 12px;border-radius:999px;border:1px solid var(--line);background:#fff;text-decoration:none;font-size:14px;color:var(--navy)}
.tabs a.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.search{display:flex;gap:8px;margin-bottom:12px}
input,select,textarea{font:inherit;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--text)}
textarea{min-height:80px;resize:vertical}
button,.btn{display:inline-block;font:inherit;font-weight:600;padding:10px 16px;border-radius:10px;border:0;background:var(--blue);color:#fff;text-decoration:none;cursor:pointer;min-height:44px}
.btn.secondary,button.secondary{background:#fff;color:var(--navy);border:1px solid var(--line)}
.case{display:block;text-decoration:none;color:inherit}
.case .top{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.ref{font-weight:700;color:var(--navy);letter-spacing:.3px}
.name{font-weight:600;font-size:16px;margin-top:2px}
.meta{color:var(--muted);font-size:13px}
.badge{display:inline-block;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;background:#e7f0fa;color:var(--navy);white-space:nowrap}
.badge.new{background:#fff1d6;color:var(--warn)}
.badge.done{background:#e3f3ea;color:var(--ok)}
.badge.off{background:#eee;color:#666}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
dl{margin:0;display:grid;grid-template-columns:minmax(110px,35%) 1fr;gap:6px 12px;font-size:14px}
dt{color:var(--muted)}
dd{margin:0;word-break:break-word}
.doc{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line)}
.doc:first-of-type{border-top:0}
.timeline{list-style:none;margin:0;padding:0}
.timeline li{padding:8px 0;border-top:1px solid var(--line);font-size:14px}
.timeline li:first-child{border-top:0}
.flash{padding:10px 14px;border-radius:10px;margin-bottom:12px;font-size:14px}
.flash.ok{background:#e3f3ea;color:var(--ok)}
.flash.err{background:#fdf0f0;color:var(--err)}
label{display:block;font-size:14px;font-weight:600;margin:10px 0 4px}
.check{display:flex;gap:8px;align-items:center;font-weight:400;margin-top:10px}
.check input{width:auto}
.empty{color:var(--muted);text-align:center;padding:24px}
.login{max-width:380px;margin:40px auto}
.code{font-size:24px;letter-spacing:6px;text-align:center}
`;

const FLASH = {
  status: ['ok', 'Status updated.'],
  status_emailed: ['ok', 'Status updated and the client was emailed.'],
  status_email_failed: ['err', 'Status updated, but the email to the client could not be sent.'],
  status_no_email: ['ok', 'Status updated. The client has no email address, so contact them directly.'],
  note: ['ok', 'Note added.'],
  unchanged: ['ok', 'Nothing changed.']
};

export function page(title, body, { signedIn = false } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · Awal Admin</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <a href="/admin/">Awal Global · Cases</a>
  ${signedIn ? '<form method="post" action="/admin/logout"><button type="submit">Log out</button></form>' : ''}
</header>
<main>${body}</main>
</body>
</html>`;
}

function badge(kind, status) {
  const cls = status === 'new' ? 'new' : (['closed', 'delivered', 'approved', 'converted'].includes(status) ? 'done' : (status === 'cancelled' ? 'off' : ''));
  return `<span class="badge ${cls}">${esc(statusInfo(kind, status).label)}</span>`;
}

function flashHtml(key) {
  const f = FLASH[key];
  return f ? `<div class="flash ${f[0]}">${esc(f[1])}</div>` : '';
}

// ── Login ───────────────────────────────────────────────────────
export function loginPage({ step = 'email', email = '', next = '/admin/', error = '' } = {}) {
  const body = step === 'code'
    ? `<div class="card login">
        <h1>Enter your code</h1>
        <p class="meta">If ${esc(email)} is an authorised address, a 6-digit code has been emailed to it. It expires in 10 minutes.</p>
        ${error ? `<div class="flash err">${esc(error)}</div>` : ''}
        <form method="post" action="/admin/login">
          <input type="hidden" name="action" value="verify">
          <input type="hidden" name="email" value="${esc(email)}">
          <input type="hidden" name="next" value="${esc(next)}">
          <label for="code">Login code</label>
          <input id="code" class="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus>
          <div class="actions"><button type="submit">Sign in</button><a class="btn secondary" href="/admin/login?next=${encodeURIComponent(next)}">Start again</a></div>
        </form>
      </div>`
    : `<div class="card login">
        <h1>Sign in</h1>
        <p class="meta">We'll email you a one-time login code.</p>
        ${error ? `<div class="flash err">${esc(error)}</div>` : ''}
        <form method="post" action="/admin/login">
          <input type="hidden" name="action" value="send">
          <input type="hidden" name="next" value="${esc(next)}">
          <label for="email">Email address</label>
          <input id="email" name="email" type="email" autocomplete="email" required autofocus value="${esc(email)}">
          <div class="actions"><button type="submit">Email me a code</button></div>
        </form>
      </div>`;
  return page('Sign in', body);
}

// ── Case list ───────────────────────────────────────────────────
export const VIEWS = [
  { key: 'open', label: 'Open' },
  { key: 'new', label: 'New' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' }
];

export function listPage({ rows, view, q, counts }) {
  const tabs = VIEWS.map(v =>
    `<a class="${v.key === view ? 'on' : ''}" href="/admin/?view=${v.key}${q ? `&q=${encodeURIComponent(q)}` : ''}">${esc(v.label)} (${counts[v.key] || 0})</a>`
  ).join('');

  const items = rows.length ? rows.map(r => `
    <a class="card case" href="/admin/case/${esc(r.id)}">
      <div class="top"><span class="ref">${esc(r.reference)}</span>${badge(r.kind, r.status)}</div>
      <div class="name">${esc(r.full_name)}</div>
      <div class="meta">${esc(r.services || (r.kind === 'enquiry' ? 'Enquiry' : 'Application'))}</div>
      <div class="meta">${fmtDate(r.created_at)}${r.docs ? ` · ${r.docs} document${r.docs === 1 ? '' : 's'}` : ''}</div>
    </a>`).join('') : '<div class="card empty">No cases here.</div>';

  return page('Cases', `
    <h1>Cases</h1>
    <form class="search" method="get" action="/admin/">
      <input type="hidden" name="view" value="${esc(view)}">
      <input name="q" type="search" placeholder="Search name, reference, email or phone" value="${esc(q)}">
      <button type="submit" class="secondary">Search</button>
    </form>
    <div class="tabs">${tabs}</div>
    ${items}`, { signedIn: true });
}

// ── Case detail ─────────────────────────────────────────────────
export function casePage({ c, docs, events, flash }) {
  let fields = {};
  try { fields = JSON.parse(c.form_data || '{}'); } catch (e) { /* show nothing */ }
  const wa = whatsappLink(c.phone);
  const statuses = statusesFor(c.kind);

  const contact = `
    <div class="actions">
      ${wa ? `<a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      ${c.phone ? `<a class="btn secondary" href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}">Call</a>` : ''}
      ${c.email ? `<a class="btn secondary" href="mailto:${esc(c.email)}?subject=${encodeURIComponent(`Your request ${c.reference}`)}">Email</a>` : ''}
    </div>`;

  const statusForm = `
    <form method="post" action="/admin/case/${esc(c.id)}/status">
      <label for="status">Move to</label>
      <select id="status" name="status">
        ${statuses.map(s => `<option value="${esc(s.key)}"${s.key === c.status ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}
      </select>
      <label for="message">Message to the client (optional)</label>
      <textarea id="message" name="message" maxlength="2000" placeholder="Added under the standard update, e.g. what you need from them next"></textarea>
      ${c.email ? `<label class="check"><input type="checkbox" name="notify" value="1" checked> Email the client about this update</label>` : '<p class="meta">No client email on file — update them on WhatsApp.</p>'}
      <div class="actions"><button type="submit">Update status</button></div>
    </form>`;

  const docsHtml = docs.length ? docs.map(d => `
    <div class="doc">
      <div><div>${esc(d.file_name)}</div><div class="meta">${fmtSize(d.size_bytes)} · ${fmtDay(d.uploaded_at)}</div></div>
      <div class="actions" style="margin:0"><a class="btn secondary" href="/admin/doc/${esc(d.id)}" target="_blank" rel="noopener">View</a></div>
    </div>`).join('') : '<p class="meta">No documents uploaded.</p>';

  // Name, email, phone and consent are shown on their own, so skip their raw form copies
  const SHOWN_ELSEWHERE = /^(full name|name|email|email address|phone|phone number|phone \/ whatsapp number|declaration accurate|declaration consent)$/i;
  const fieldRows = Object.entries(fields)
    .filter(([k]) => !SHOWN_ELSEWHERE.test(k.replace(/_/g, ' ')))
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');

  const timeline = events.map(e => {
    const what = e.event === 'status_changed'
      ? `Status: ${esc(statusInfo(c.kind, e.from_status).label)} → <strong>${esc(statusInfo(c.kind, e.to_status).label)}</strong>`
      : e.event === 'created' ? 'Case created from the website'
      : e.event === 'client_notified' ? 'Client emailed'
      : e.event === 'note' ? 'Note' : esc(e.event);
    return `<li><div>${what}</div>${e.note && e.event !== 'created' ? `<div style="white-space:pre-line">${esc(e.note)}</div>` : ''}<div class="meta">${fmtDate(e.created_at)}</div></li>`;
  }).join('');

  const retention = c.legal_hold
    ? 'On legal hold — will not be deleted'
    : (c.retain_until ? `Keep until ${fmtDay(c.retain_until)}` : 'Kept while the case is open; the retention clock starts when it closes');

  return page(c.reference, `
    ${flashHtml(flash)}
    <div class="card">
      <div class="top" style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><span class="ref">${esc(c.reference)}</span>${badge(c.kind, c.status)}</div>
      <h1 style="margin:4px 0 2px">${esc(c.full_name)}</h1>
      <div class="meta">${esc(c.services || (c.kind === 'enquiry' ? 'Enquiry' : 'Application'))}</div>
      <div class="meta">Received ${fmtDate(c.created_at)}</div>
      ${contact}
    </div>
    <div class="card"><h2>Update status</h2>${statusForm}</div>
    <div class="card"><h2>Documents</h2>${docsHtml}</div>
    <div class="card"><h2>Client details</h2>
      <dl>
        <dt>Email</dt><dd>${esc(c.email || '—')}</dd>
        <dt>Phone</dt><dd>${esc(c.phone || '—')}</dd>
        ${fieldRows}
        <dt>Consent</dt><dd>${c.kind === 'application' ? (c.consent_accuracy && c.consent_processing ? 'Both declarations ticked' : 'Not recorded') : 'Not applicable (enquiry)'}</dd>
      </dl>
    </div>
    <div class="card"><h2>History</h2>
      <ul class="timeline">${timeline}</ul>
      <form method="post" action="/admin/case/${esc(c.id)}/note">
        <label for="note">Add a private note</label>
        <textarea id="note" name="note" maxlength="2000" required placeholder="Only you can see notes"></textarea>
        <div class="actions"><button type="submit" class="secondary">Add note</button></div>
      </form>
    </div>
    <div class="card"><h2>Record keeping</h2>
      <dl>
        <dt>Retention</dt><dd>${esc(retention)}</dd>
        <dt>Type</dt><dd>${c.kind === 'application' ? 'Application (6 years after closing; 12 months if cancelled)' : 'Enquiry (12 months after last activity)'}</dd>
        <dt>Status</dt><dd>${isOpen(c.status) ? 'Open' : `Closed ${fmtDay(c.closed_at)}`}</dd>
      </dl>
    </div>
    <p><a href="/admin/">← All cases</a></p>`, { signedIn: true });
}

export function notFoundPage() {
  return page('Not found', '<div class="card empty">That case or document was not found.</div><p><a href="/admin/">← All cases</a></p>', { signedIn: true });
}
