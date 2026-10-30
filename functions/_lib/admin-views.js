/**
 * Pages of the admin dashboard (/admin). Each function returns a full HTML
 * page; the shell, styles and building blocks live in admin-ui.js.
 */
import { statusesFor, statusInfo, isOpen, whatsappLink, nextStatus, progressPath } from './cases.js';
import { EARLY_ERASE_REASONS, eraseBlocker } from './compliance.js';
import {
  esc, fmtDate, fmtDay, ago, fmtSize, icon, statusPill, pill, avatar, emptyState, flashHtml,
  shell, htmlDocument, pageHead
} from './admin-ui.js';

export { esc };

// Messages shown after an action (?done=key)
const FLASH = {
  status: ['ok', 'Status updated.'],
  status_emailed: ['ok', 'Status updated and the client was emailed.'],
  status_email_failed: ['err', 'Status updated, but the email to the client could not be sent.'],
  status_no_email: ['ok', 'Status updated. The client has no email address, so let them know on WhatsApp.'],
  unchanged: ['ok', 'Nothing changed.'],
  note: ['ok', 'Note added.'],
  followup: ['ok', 'Follow-up saved. It will show in your morning summary when it is due.'],
  followup_cleared: ['ok', 'Follow-up cleared.'],
  followup_invalid: ['err', 'Please choose a valid date for the follow-up.'],
  hold_on: ['ok', 'Legal hold placed. This case cannot be erased until the hold is released.'],
  hold_off: ['ok', 'Legal hold released.'],
  hold_reason: ['err', 'Please give a reason for the legal hold.'],
  erased: ['ok', 'Personal data and documents erased. A record that the case existed has been kept.'],
  erase_blocked: ['err', 'This case cannot be erased yet — see the reason below.'],
  erase_confirm: ['err', 'To erase, tick the confirmation box and type the case reference exactly.'],
  client_updated: ['ok', 'Client details updated.'],
  client_invalid: ['err', 'Please enter a name and a valid email address.'],
  request_logged: ['ok', 'Request recorded. It stays on the Records page until you mark it done.'],
  request_done: ['ok', 'Request marked as done.'],
  client_erased: ['ok', 'The client\'s personal data and documents have been erased.'],
  client_erase_blocked: ['err', 'Some of this client\'s records must still be kept by law — nothing was erased.']
};

export function flashFor(key) {
  return FLASH[key] || null;
}

function stepper(kind, status) {
  const path = progressPath(kind, status);
  const current = path.findIndex(s => s.key === status);
  return `<div class="stepper">${path.map((s, i) => `<div class="step ${i === current ? 'now' : (i < current ? 'done' : '')}"><span class="dot"></span>${esc(s.key === 'new' ? 'Received' : s.label)}</div>`).join('')}</div>`;
}

function caseRowMobile(r) {
  return `<a class="row" href="/admin/case/${esc(r.id)}">
    ${avatar(r.full_name)}
    <div class="row-main"><div class="row-title">${esc(r.full_name)}</div><div class="row-sub">${esc(r.services || (r.kind === 'enquiry' ? 'Enquiry' : 'Application'))}</div></div>
    <div class="row-side">${statusPill(r.kind, r.status)}<span class="ref">${esc(r.reference)}</span></div>
  </a>`;
}

// ── Sign-in ─────────────────────────────────────────────────────
export function loginPage({ step = 'email', email = '', next = '/admin/', error = '' } = {}) {
  const form = step === 'code'
    ? `<h1>Check your email</h1>
       <p class="muted">If <strong>${esc(email)}</strong> is an authorised address, we've sent it a 6-digit code. It expires in 10 minutes.</p>
       ${error ? flashHtml(['err', error]) : ''}
       <form method="post" action="/admin/login">
         <input type="hidden" name="action" value="verify">
         <input type="hidden" name="email" value="${esc(email)}">
         <input type="hidden" name="next" value="${esc(next)}">
         <label for="code">Login code</label>
         <input id="code" class="code-input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required autofocus>
         <div class="btn-row"><button class="btn block" type="submit">Sign in</button></div>
       </form>
       <p class="small muted" style="margin-top:16px"><a href="/admin/login?next=${encodeURIComponent(next)}">Use a different email or get a new code</a></p>`
    : `<h1>Sign in</h1>
       <p class="muted">We'll email you a one-time code. No password needed.</p>
       ${error ? flashHtml(['err', error]) : ''}
       <form method="post" action="/admin/login">
         <input type="hidden" name="action" value="send">
         <input type="hidden" name="next" value="${esc(next)}">
         <label for="email">Email address</label>
         <input id="email" name="email" type="email" autocomplete="email" required autofocus value="${esc(email)}">
         <div class="btn-row"><button class="btn block" type="submit">Email me a code ${icon('arrow', 18)}</button></div>
       </form>`;
  return htmlDocument('Sign in', `
  <div class="login-wrap"><div class="login">
    <div class="card">
      <span class="brand-mark" style="width:44px;height:44px">A</span>
      ${form}
    </div>
    <p class="small muted" style="text-align:center">Awal Global Consults · Case Manager</p>
  </div></div>`);
}

// ── Overview ────────────────────────────────────────────────────
export function overviewPage({ admin, badges, stats, needsReply, followUps, waiting, recent, alerts }) {
  const hour = Number(new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hour12: false }));
  const greeting = hour < 12 ? 'Good morning' : (hour < 17 ? 'Good afternoon' : 'Good evening');
  const today = new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long' });

  const statCard = (href, label, num, note, ic, tone) => `
    <a class="stat" href="${href}"><div class="stat-top"><span>${esc(label)}</span><span class="stat-ic tone-${tone}">${icon(ic, 18)}</span></div>
    <div class="stat-num">${num}</div><div class="stat-note">${esc(note)}</div></a>`;

  const list = (rows, empty, sub) => rows.length
    ? `<div class="rows">${rows.map(r => `<a class="row" href="/admin/case/${esc(r.id)}">${avatar(r.full_name)}
        <div class="row-main"><div class="row-title">${esc(r.full_name)}</div><div class="row-sub">${esc(sub(r))}</div></div>
        <div class="row-side">${statusPill(r.kind, r.status)}<span class="ref">${esc(r.reference)}</span></div></a>`).join('')}</div>`
    : `<div class="card-body">${emptyState('check', empty)}</div>`;

  const recentHtml = recent.length
    ? `<ul class="timeline" style="padding:0 18px 6px">${recent.map(e => `<li><span class="tl-dot">${icon(eventIcon(e.event), 15)}</span>
        <div class="tl-body"><a href="/admin/case/${esc(e.case_id)}" style="text-decoration:none"><strong>${esc(e.reference)}</strong></a> · ${esc(eventLabel(e, e.kind))}<div class="small muted">${ago(e.created_at)}</div></div></li>`).join('')}</ul>`
    : `<div class="card-body">${emptyState('activity', 'No activity yet')}</div>`;

  const alertHtml = alerts.map(a => `<a href="${a.href}" class="note ${a.tone}" style="text-decoration:none;margin-bottom:12px">${icon(a.icon, 18)}<span>${esc(a.text)}</span></a>`).join('');

  return shell({ title: 'Overview', active: 'overview', admin, badges, body: `
    ${pageHead(greeting, esc(today))}
    ${alertHtml}
    <div class="stats">
      ${statCard('/admin/cases?view=new', 'Needs your reply', stats.newCount, stats.newCount ? 'Quote promised within 1 working day' : 'All caught up', 'inbox', 'amber')}
      ${statCard('/admin/cases?view=waiting', 'Waiting on clients', stats.waiting, 'Quotes and documents', 'clock', 'blue')}
      ${statCard('/admin/cases?view=progress', 'In progress', stats.inProgress, 'Paid, filed or approved', 'cases', 'violet')}
      ${statCard('/admin/cases?view=followups', 'Follow-ups due', stats.followUpsDue, 'Due within 7 days', 'bell', 'green')}
    </div>
    <div class="grid grid-3">
      <div>
        <div class="card"><div class="card-head"><h2>Needs your reply</h2><a href="/admin/cases?view=new">View all</a></div>
          ${list(needsReply, 'Nothing waiting for a reply', r => `${r.services || 'Enquiry'} · ${ago(r.created_at)}`)}</div>
        <div class="card"><div class="card-head"><h2>Follow-ups due</h2><a href="/admin/cases?view=followups">View all</a></div>
          ${list(followUps, 'No follow-ups due this week', r => `${fmtDay(r.follow_up_at)}${r.follow_up_note ? ` · ${r.follow_up_note}` : ''}`)}</div>
        <div class="card"><div class="card-head"><h2>Waiting on clients</h2><a href="/admin/cases?view=waiting">View all</a></div>
          ${list(waiting, 'Not waiting on anyone', r => `Since ${ago(r.status_changed_at)}`)}</div>
      </div>
      <div>
        <div class="card"><div class="card-head"><h2>Recent activity</h2><a href="/admin/activity">All</a></div>${recentHtml}</div>
      </div>
    </div>` });
}

// ── Cases ───────────────────────────────────────────────────────
export const CASE_VIEWS = [
  { key: 'open', label: 'Open' },
  { key: 'new', label: 'Needs reply' },
  { key: 'waiting', label: 'Waiting on client' },
  { key: 'progress', label: 'In progress' },
  { key: 'followups', label: 'Follow-ups' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' }
];

export function casesPage({ admin, badges, rows, view, q, counts }) {
  const chips = CASE_VIEWS.map(v => `<a class="${v.key === view ? 'on' : ''}" href="/admin/cases?view=${v.key}${q ? `&q=${encodeURIComponent(q)}` : ''}">${esc(v.label)} <span class="n">${counts[v.key] || 0}</span></a>`).join('');
  const table = rows.length ? `
    <table class="list only-desktop">
      <thead><tr><th>Client</th><th>Reference</th><th>Service</th><th>Status</th><th>${view === 'followups' ? 'Follow up' : 'Received'}</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="link">
        <td><a class="cover" href="/admin/case/${esc(r.id)}" style="display:flex;align-items:center;gap:10px">${avatar(r.full_name)}<span><strong>${esc(r.full_name)}</strong>${r.docs ? `<div class="small muted">${r.docs} document${r.docs === 1 ? '' : 's'}</div>` : ''}</span></a></td>
        <td><a class="cover ref" href="/admin/case/${esc(r.id)}">${esc(r.reference)}</a></td>
        <td><a class="cover" href="/admin/case/${esc(r.id)}">${esc(r.services || (r.kind === 'enquiry' ? 'Enquiry' : '—'))}</a></td>
        <td><a class="cover" href="/admin/case/${esc(r.id)}">${statusPill(r.kind, r.status)}</a></td>
        <td class="small muted"><a class="cover" href="/admin/case/${esc(r.id)}">${view === 'followups' ? esc(fmtDay(r.follow_up_at)) : esc(ago(r.created_at))}</a></td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="rows only-mobile">${rows.map(caseRowMobile).join('')}</div>`
    : `<div class="card-body">${emptyState('cases', q ? 'No cases match your search' : 'No cases here')}</div>`;

  return shell({ title: 'Cases', active: 'cases', admin, badges, body: `
    ${pageHead('Cases', 'Every application and enquiry from the website')}
    <form class="toolbar" method="get" action="/admin/cases">
      <input type="hidden" name="view" value="${esc(view)}">
      <div class="search">${icon('search', 18)}<input name="q" type="search" placeholder="Search name, reference, email, phone or service" value="${esc(q)}"></div>
      <button class="btn ghost" type="submit">Search</button>
    </form>
    <div class="chips">${chips}</div>
    <div class="card">${table}</div>` });
}

// ── Case detail ─────────────────────────────────────────────────
function eventIcon(event) {
  return { created: 'inbox', status_changed: 'arrow', client_notified: 'mail', reminder_sent: 'bell', note: 'doc', follow_up: 'clock', legal_hold: 'lock', erased: 'trash' }[event] || 'activity';
}

function eventLabel(e, kind) {
  switch (e.event) {
    case 'created': return 'Received from the website';
    case 'status_changed': return e.from_status === e.to_status ? `Message sent at ${statusInfo(kind, e.to_status).label}` : `Moved to ${statusInfo(kind, e.to_status).label}`;
    case 'client_notified': return 'Client emailed about the update';
    case 'reminder_sent': return 'Automatic reminder emailed to the client';
    case 'note': return 'Private note';
    case 'follow_up': return 'Follow-up updated';
    case 'legal_hold': return 'Legal hold changed';
    case 'erased': return 'Personal data erased';
    default: return e.event;
  }
}

const CASE_TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'documents', label: 'Documents' },
  { key: 'activity', label: 'Activity' },
  { key: 'records', label: 'Records' }
];

export function casePage({ admin, badges, c, tab, docs, events, flash }) {
  const wa = whatsappLink(c.phone);
  const purged = !!c.purged_at;
  const tabs = CASE_TABS.map(t => `<a class="${t.key === tab ? 'on' : ''}" href="/admin/case/${esc(c.id)}${t.key === 'summary' ? '' : `?tab=${t.key}`}">${esc(t.label)}${t.key === 'documents' && docs.length ? ` (${docs.length})` : ''}</a>`).join('');

  const header = `
    <div class="card">
      <div class="case-head">
        ${avatar(c.full_name, 'lg')}
        <div style="flex:1;min-width:0">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="ref">${esc(c.reference)}</span>${statusPill(c.kind, c.status)}${c.legal_hold ? pill('Legal hold', 'red') : ''}${purged ? pill('Erased', 'grey') : ''}</div>
          <h1>${esc(c.full_name)}</h1>
          <div class="muted small">${esc(c.services || (c.kind === 'enquiry' ? 'Enquiry' : 'Application'))} · received ${esc(fmtDate(c.created_at))}</div>
        </div>
      </div>
      ${purged ? '' : `<div class="case-actions">
        ${wa ? `<a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener">${icon('chat', 18)}WhatsApp</a>` : ''}
        ${c.phone ? `<a class="btn ghost" href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}">${icon('phone', 18)}Call</a>` : ''}
        ${c.email ? `<a class="btn ghost" href="mailto:${esc(c.email)}?subject=${encodeURIComponent(`Your request ${c.reference}`)}">${icon('mail', 18)}Email</a>` : ''}
        <a class="btn ghost" href="/admin/client/${esc(c.client_id)}">${icon('clients', 18)}Client</a>
      </div>`}
    </div>`;

  let body = '';
  if (tab === 'documents') body = caseDocuments(c, docs);
  else if (tab === 'activity') body = caseActivity(c, events);
  else if (tab === 'records') body = caseRecords(c);
  else body = caseSummary(c);

  return shell({ title: c.reference, active: 'cases', admin, badges, body: `
    <a class="crumb" href="/admin/cases">${icon('back', 16)}Cases</a>
    ${flashHtml(flash)}
    ${purged ? `<div class="note" style="margin-bottom:16px">${icon('trash', 18)}<span>This case's personal data and documents were erased on ${esc(fmtDay(c.purged_at))}. Only the record that it existed remains.</span></div>` : ''}
    ${header}
    <div class="tabs">${tabs}</div>
    ${body}` });
}

function caseSummary(c) {
  let fields = {};
  try { fields = JSON.parse(c.form_data || '{}'); } catch (e) { /* show nothing */ }
  const SHOWN_ELSEWHERE = /^(full name|name|email|email address|phone|phone number|phone \/ whatsapp number|declaration accurate|declaration consent)$/i;
  const fieldRows = Object.entries(fields).filter(([k]) => !SHOWN_ELSEWHERE.test(k.replace(/_/g, ' ')))
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  const next = c.purged_at ? null : nextStatus(c.kind, c.status);
  const nextInfo = next ? statusInfo(c.kind, next) : null;
  const waitingNote = c.kind === 'application' && ['quote_sent', 'awaiting_documents'].includes(c.status)
    ? `<div class="note" style="margin-top:14px">${icon('bell', 18)}<span>While the case is at this stage, the client gets an automatic reminder after 3 days and again after 7. Moving it on stops them.</span></div>` : '';

  const notifyBox = (checked) => c.email
    ? `<label class="check"><input type="checkbox" name="notify" value="1"${checked ? ' checked' : ''}> Email ${esc(c.full_name.split(' ')[0] || 'the client')} about this update</label>`
    : '<p class="small muted">No email on file — let the client know on WhatsApp.</p>';

  const progress = c.purged_at ? '' : `
    <div class="card"><div class="card-head"><h2>Progress</h2></div><div class="card-body">
      ${stepper(c.kind, c.status)}
      ${next ? `<form method="post" action="/admin/case/${esc(c.id)}/status">
        <input type="hidden" name="status" value="${esc(next)}">
        <div class="next-box">
          <div><div class="small muted">Next step</div><strong>Move to "${esc(nextInfo.label)}"</strong></div>
          <button class="btn" type="submit">${icon('check', 18)}Mark as ${esc(nextInfo.label.toLowerCase())}</button>
        </div>
        ${notifyBox(nextInfo.notify)}
      </form>` : ''}
      ${waitingNote}
      <details class="more"${next ? '' : ' open'}>
        <summary>Choose another stage or add a message to the client</summary>
        <form method="post" action="/admin/case/${esc(c.id)}/status">
          <label for="status">Stage</label>
          <select id="status" name="status">${statusesFor(c.kind).map(s => `<option value="${esc(s.key)}"${s.key === c.status ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
          <label for="message">Message to the client (optional)</label>
          <textarea id="message" name="message" maxlength="2000" placeholder="e.g. Your quote is ₦35,000 including filing fees."></textarea>
          ${notifyBox(true)}
          <div class="btn-row"><button class="btn" type="submit">Update</button></div>
        </form>
      </details>
    </div></div>`;

  const followUp = c.purged_at ? '' : `
    <div class="card"><div class="card-head"><h2>Follow-up reminder</h2></div><div class="card-body">
      ${c.follow_up_at
        ? `<div class="note" style="margin-bottom:6px">${icon('bell', 18)}<span><strong>${esc(fmtDay(c.follow_up_at))}</strong>${c.follow_up_note ? ` — ${esc(c.follow_up_note)}` : ''}</span></div>`
        : '<p class="small muted" style="margin:0">None set. Follow-ups appear in your morning summary from a week before they are due.</p>'}
      <details class="more"${c.follow_up_at ? '' : ''}>
        <summary>${c.follow_up_at ? 'Change or clear' : 'Set a follow-up'}</summary>
        <form method="post" action="/admin/case/${esc(c.id)}/followup">
          <label for="fu-date">Remind me on</label>
          <input id="fu-date" name="date" type="date" value="${c.follow_up_at ? esc(c.follow_up_at.slice(0, 10)) : ''}">
          <label for="fu-note">What to do</label>
          <input id="fu-note" name="note" maxlength="500" placeholder="e.g. Offer annual returns filing" value="${esc(c.follow_up_note || '')}">
          <div class="btn-row"><button class="btn ghost" type="submit">Save</button>${c.follow_up_at ? '<button class="btn ghost danger" type="submit" name="clear" value="1" formnovalidate>Clear</button>' : ''}</div>
        </form>
      </details>
    </div></div>`;

  const details = `
    <div class="card"><div class="card-head"><h2>Client details</h2></div><div class="card-body">
      <dl class="kv">
        <dt>Email</dt><dd>${esc(c.email || '—')}</dd>
        <dt>Phone</dt><dd>${esc(c.phone || '—')}</dd>
        ${fieldRows}
        ${c.kind === 'application' ? `<dt>Consent</dt><dd>${c.consent_accuracy && c.consent_processing ? `${icon('check', 16)} Both declarations ticked` : 'Not recorded'}</dd>` : ''}
      </dl>
    </div></div>`;

  return `<div class="grid grid-3"><div>${progress}${details}</div><div>${followUp}</div></div>`;
}

function caseDocuments(c, docs) {
  if (c.purged_at) return `<div class="card"><div class="card-body">${emptyState('trash', 'Documents erased', `Removed on ${fmtDay(c.purged_at)}.`)}</div></div>`;
  if (!docs.length) return `<div class="card"><div class="card-body">${emptyState('doc', 'No documents uploaded', 'Documents sent on WhatsApp are not stored here.')}</div></div>`;
  return `<div class="card"><div class="card-body">${docs.map(d => {
    const isImg = /\.(jpe?g|png)$/i.test(d.file_name);
    return `<div class="doc"><span class="doc-ic ${isImg ? 'img' : ''}">${icon('doc', 20)}</span>
      <div class="row-main"><div class="row-title">${esc(d.file_name)}</div><div class="small muted">${fmtSize(d.size_bytes)} · ${esc(fmtDate(d.uploaded_at))}</div></div>
      <a class="btn ghost sm" href="/admin/doc/${esc(d.id)}" target="_blank" rel="noopener">Open</a></div>`;
  }).join('')}</div></div>
  <p class="small muted">${icon('lock', 14)} Documents are stored privately. Every time one is opened, it is recorded in the activity log.</p>`;
}

function caseActivity(c, events) {
  const items = events.map(e => `<li><span class="tl-dot">${icon(eventIcon(e.event), 15)}</span><div class="tl-body">
    <strong>${esc(eventLabel(e, c.kind))}</strong>
    ${e.note && !['created', 'reminder_sent'].includes(e.event) ? `<div class="tl-note">${esc(e.note)}</div>` : ''}
    <div class="small muted">${esc(fmtDate(e.created_at))}${e.actor && e.actor.startsWith('system') ? ' · automatic' : ''}</div></div></li>`).join('');
  return `<div class="grid grid-3">
    <div class="card"><div class="card-head"><h2>History</h2></div><div class="card-body"><ul class="timeline">${items}</ul></div></div>
    ${c.purged_at ? '' : `<div class="card"><div class="card-head"><h2>Add a private note</h2></div><div class="card-body">
      <form method="post" action="/admin/case/${esc(c.id)}/note">
        <textarea name="note" maxlength="2000" required placeholder="Only you can see notes. e.g. Called client, paying Friday."></textarea>
        <div class="btn-row"><button class="btn ghost" type="submit">Add note</button></div>
      </form></div></div>`}
  </div>`;
}

function caseRecords(c) {
  const now = new Date().toISOString();
  const retention = c.purged_at ? `Erased on ${fmtDay(c.purged_at)}`
    : c.legal_hold ? 'On legal hold — kept until the hold is released'
    : c.retain_until ? `Keep until ${fmtDay(c.retain_until)}`
    : 'Kept while the case is open; the clock starts when it is closed';
  const blocker = eraseBlocker(c, now);
  const rule = c.kind === 'application'
    ? 'Applications: 6 years after closing (covers the 5-year AML minimum and CAMA/CITA record keeping). Cancelled before any work: 12 months.'
    : 'Enquiries: 12 months after the last activity.';

  const hold = c.purged_at ? '' : `
    <div class="card"><div class="card-head"><h2>Legal hold</h2></div><div class="card-body">
      ${c.legal_hold
        ? `<div class="note danger">${icon('lock', 18)}<span><strong>On hold:</strong> ${esc(c.legal_hold_reason || 'No reason given')}</span></div>
           <form method="post" action="/admin/case/${esc(c.id)}/hold"><input type="hidden" name="on" value="0"><div class="btn-row"><button class="btn ghost" type="submit">Release hold</button></div></form>`
        : `<p class="small muted" style="margin-top:0">Place a hold if the records may be needed for a dispute, investigation or regulator request. A case on hold is never erased.</p>
           <form method="post" action="/admin/case/${esc(c.id)}/hold"><input type="hidden" name="on" value="1">
             <label for="hold-reason">Reason</label><input id="hold-reason" name="reason" maxlength="300" required placeholder="e.g. SCUML enquiry received 3 Nov">
             <div class="btn-row"><button class="btn ghost" type="submit">${icon('lock', 16)}Place legal hold</button></div></form>`}
    </div></div>`;

  const confirmFields = `
    <label class="check"><input type="checkbox" name="confirm" value="1" required> I understand this permanently deletes the documents and personal details for ${esc(c.reference)}.</label>
    <label for="confirm-ref">Type <strong>${esc(c.reference)}</strong> to confirm</label>
    <input id="confirm-ref" name="confirm_ref" autocomplete="off" required>`;

  const erase = c.purged_at ? '' : `
    <div class="card"><div class="card-head"><h2>Erase personal data</h2></div><div class="card-body">
      ${blocker
        ? `<div class="note">${icon('lock', 18)}<span>${esc(blocker)}</span></div>`
        : `<div class="note warn">${icon('alert', 18)}<span>The retention period has ended. You can now erase this case's documents and personal details.</span></div>
           <form method="post" action="/admin/case/${esc(c.id)}/erase"><input type="hidden" name="mode" value="retention">${confirmFields}
           <div class="btn-row"><button class="btn danger" type="submit">${icon('trash', 16)}Erase now</button></div></form>`}
      ${blocker && !c.legal_hold ? `
      <details class="more"><summary>Erase early — test or duplicate entries only</summary>
        <p class="small muted">Only for entries that were never a real client matter. Real client files must be kept for the full retention period. The reason is recorded permanently.</p>
        <form method="post" action="/admin/case/${esc(c.id)}/erase"><input type="hidden" name="mode" value="early">
          <label for="early-reason">Reason</label>
          <select id="early-reason" name="reason">${Object.entries(EARLY_ERASE_REASONS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
          ${confirmFields}
          <div class="btn-row"><button class="btn danger" type="submit">${icon('trash', 16)}Erase this entry</button></div>
        </form>
      </details>` : ''}
    </div></div>`;

  return `<div class="grid grid-3"><div>
    <div class="card"><div class="card-head"><h2>Record keeping</h2></div><div class="card-body">
      <dl class="kv">
        <dt>Retention</dt><dd><strong>${esc(retention)}</strong></dd>
        <dt>Rule</dt><dd class="small">${esc(rule)}</dd>
        <dt>Case</dt><dd>${isOpen(c.status) ? 'Open' : `Closed ${esc(fmtDay(c.closed_at))}`}</dd>
        <dt>Received from</dt><dd class="small">${esc(c.source_page || '—')}</dd>
      </dl>
    </div></div>
    ${erase}
  </div><div>${hold}
    <div class="card"><div class="card-body"><a href="/admin/client/${esc(c.client_id)}" class="row" style="padding:0;border:0">${icon('shield', 20)}<span class="row-main"><strong>Client data requests</strong><div class="small muted">Export, correct or erase everything held on this client</div></span>${icon('arrow', 18)}</a></div></div>
  </div></div>`;
}

// ── Clients ─────────────────────────────────────────────────────
export function clientsPage({ admin, badges, rows, q }) {
  const list = rows.length ? `<div class="rows">${rows.map(r => `<a class="row" href="/admin/client/${esc(r.id)}">${avatar(r.full_name)}
      <div class="row-main"><div class="row-title">${esc(r.full_name)}</div><div class="row-sub">${esc([r.email, r.phone].filter(Boolean).join(' · ') || '—')}</div></div>
      <div class="row-side"><span class="small muted">${r.cases} case${r.cases === 1 ? '' : 's'}</span><span class="small muted">${esc(ago(r.last_activity))}</span></div></a>`).join('')}</div>`
    : `<div class="card-body">${emptyState('clients', q ? 'No clients match your search' : 'No clients yet')}</div>`;
  return shell({ title: 'Clients', active: 'clients', admin, badges, body: `
    ${pageHead('Clients', 'Everyone who has applied or enquired, matched by email address')}
    <form class="toolbar" method="get" action="/admin/clients">
      <div class="search">${icon('search', 18)}<input name="q" type="search" placeholder="Search name, email or phone" value="${esc(q)}"></div>
      <button class="btn ghost" type="submit">Search</button>
    </form>
    <div class="card">${list}</div>` });
}

const REQUEST_KINDS = { access: 'Access (copy of their data)', correction: 'Correction', erasure: 'Erasure (deletion)', objection: 'Objection / stop processing', other: 'Other' };

export function clientPage({ admin, badges, client, cases, requests, eraseCheck, flash }) {
  const erased = !!client.anonymised_at;
  const caseList = cases.length ? `<div class="rows">${cases.map(c => `<a class="row" href="/admin/case/${esc(c.id)}">
      <span class="tl-dot">${icon('cases', 15)}</span>
      <div class="row-main"><div class="row-title">${esc(c.services || (c.kind === 'enquiry' ? 'Enquiry' : 'Application'))}</div><div class="row-sub">${esc(c.reference)} · ${esc(fmtDay(c.created_at))}${c.purged_at ? ' · erased' : ''}</div></div>
      <div class="row-side">${statusPill(c.kind, c.status)}</div></a>`).join('')}</div>` : `<div class="card-body">${emptyState('cases', 'No cases')}</div>`;

  const reqList = requests.length ? `<div class="rows">${requests.map(r => `<div class="row">
      <span class="tl-dot">${icon(r.completed_at ? 'check' : 'clock', 15)}</span>
      <div class="row-main"><div class="row-title">${esc(REQUEST_KINDS[r.kind] || r.kind)}</div><div class="row-sub">Received ${esc(fmtDay(r.received_at))}${r.completed_at ? ` · done ${esc(fmtDay(r.completed_at))}` : ''}${r.outcome ? ` · ${esc(r.outcome)}` : (r.note ? ` · ${esc(r.note)}` : '')}</div></div>
      ${r.completed_at ? pill('Done', 'green') : `<form method="post" action="/admin/request/${esc(r.id)}/done"><button class="btn ghost sm" type="submit">Mark done</button></form>`}</div>`).join('')}</div>` : '';

  const editForm = erased ? '' : `
    <details class="more"><summary>Correct details</summary>
      <form method="post" action="/admin/client/${esc(client.id)}/update">
        <label for="c-name">Full name</label><input id="c-name" name="full_name" required maxlength="120" value="${esc(client.full_name)}">
        <label for="c-email">Email</label><input id="c-email" name="email" type="email" maxlength="254" value="${esc(client.email || '')}">
        <label for="c-phone">Phone</label><input id="c-phone" name="phone" maxlength="40" value="${esc(client.phone || '')}">
        <div class="btn-row"><button class="btn ghost" type="submit">Save changes</button></div>
      </form>
    </details>`;

  const rights = erased
    ? `<div class="note">${icon('trash', 18)}<span>This client's personal data was erased on ${esc(fmtDay(client.anonymised_at))}.</span></div>`
    : `
      <p class="small muted" style="margin-top:0">Under the NDPA, clients can ask for a copy of their data, a correction, or its deletion. Record each request here so there is a trail of what you did.</p>
      <div class="btn-row" style="margin-top:0">
        <a class="btn ghost" href="/admin/client/${esc(client.id)}/export">${icon('download', 18)}Export all data</a>
      </div>
      <details class="more"><summary>Record a request received</summary>
        <form method="post" action="/admin/client/${esc(client.id)}/request">
          <label for="r-kind">Type</label><select id="r-kind" name="kind">${Object.entries(REQUEST_KINDS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
          <label for="r-date">Date received</label><input id="r-date" name="received" type="date" value="${new Date().toISOString().slice(0, 10)}">
          <label for="r-note">Details</label><input id="r-note" name="note" maxlength="500" placeholder="e.g. Asked by email to delete all records">
          <div class="btn-row"><button class="btn ghost" type="submit">Record request</button></div>
        </form>
      </details>
      <details class="more"><summary>Erase this client</summary>
        ${eraseCheck.blockers.length
          ? `<div class="note" style="margin-top:10px">${icon('lock', 18)}<div><strong>Some records must still be kept:</strong><ul style="margin:6px 0 0;padding-left:18px">${eraseCheck.blockers.map(b => `<li>${esc(b)}</li>`).join('')}</ul><div class="small" style="margin-top:6px">Tell the client their data will be erased when the legal retention period ends, and record the request above.</div></div></div>`
          : `<form method="post" action="/admin/client/${esc(client.id)}/erase">
              <p class="small muted">Erases the documents and personal details on all ${cases.length} case${cases.length === 1 ? '' : 's'}. This cannot be undone.</p>
              <label class="check"><input type="checkbox" name="confirm" value="1" required> I understand this is permanent.</label>
              <label for="confirm-name">Type the client's name to confirm</label><input id="confirm-name" name="confirm_name" autocomplete="off" required>
              <div class="btn-row"><button class="btn danger" type="submit">${icon('trash', 16)}Erase client</button></div>
            </form>`}
      </details>`;

  return shell({ title: client.full_name, active: 'clients', admin, badges, body: `
    <a class="crumb" href="/admin/clients">${icon('back', 16)}Clients</a>
    ${flashHtml(flash)}
    <div class="card"><div class="case-head">${avatar(client.full_name, 'lg')}<div style="flex:1;min-width:0">
      <h1>${esc(client.full_name)}</h1>
      <div class="muted small">${esc([client.email, client.phone].filter(Boolean).join(' · ') || 'No contact details')}</div>
      <div class="muted small">Client since ${esc(fmtDay(client.created_at))}</div></div></div>
      ${erased ? '' : `<div class="case-actions">${whatsappLink(client.phone) ? `<a class="btn wa" href="${esc(whatsappLink(client.phone))}" target="_blank" rel="noopener">${icon('chat', 18)}WhatsApp</a>` : ''}${client.email ? `<a class="btn ghost" href="mailto:${esc(client.email)}">${icon('mail', 18)}Email</a>` : ''}</div>`}
    </div>
    <div class="grid grid-3">
      <div>
        <div class="card"><div class="card-head"><h2>Cases</h2></div>${caseList}</div>
      </div>
      <div>
        <div class="card"><div class="card-head"><h2>Data rights</h2></div><div class="card-body">${rights}${editForm}</div></div>
        ${requests.length ? `<div class="card"><div class="card-head"><h2>Requests</h2></div>${reqList}</div>` : ''}
      </div>
    </div>` });
}

// ── Records (compliance) ────────────────────────────────────────
export function recordsPage({ admin, badges, due, holds, requests, backups, stats, flash }) {
  const dueList = due.length ? `<div class="rows">${due.map(c => `<a class="row" href="/admin/case/${esc(c.id)}?tab=records">${avatar(c.full_name)}
      <div class="row-main"><div class="row-title">${esc(c.full_name)}</div><div class="row-sub">${esc(c.reference)} · kept until ${esc(fmtDay(c.retain_until))}</div></div>
      <div class="row-side">${pill('Review', 'amber')}</div></a>`).join('')}</div>`
    : `<div class="card-body">${emptyState('check', 'Nothing to review', 'Records appear here once their legal retention period has ended.')}</div>`;

  const holdList = holds.length ? `<div class="rows">${holds.map(c => `<a class="row" href="/admin/case/${esc(c.id)}?tab=records"><span class="tl-dot">${icon('lock', 15)}</span>
      <div class="row-main"><div class="row-title">${esc(c.reference)} · ${esc(c.full_name)}</div><div class="row-sub">${esc(c.legal_hold_reason || '')}</div></div></a>`).join('')}</div>`
    : `<div class="card-body">${emptyState('lock', 'No legal holds')}</div>`;

  const reqList = requests.length ? `<div class="rows">${requests.map(r => {
    const days = Math.floor((Date.now() - new Date(r.received_at).getTime()) / 86400000);
    return `<a class="row" href="/admin/client/${esc(r.client_id)}"><span class="tl-dot">${icon('clock', 15)}</span>
      <div class="row-main"><div class="row-title">${esc(r.full_name || 'Client')} — ${esc(REQUEST_KINDS[r.kind] || r.kind)}</div><div class="row-sub">Received ${esc(fmtDay(r.received_at))}${r.note ? ` · ${esc(r.note)}` : ''}</div></div>
      <div class="row-side">${pill(`${days} day${days === 1 ? '' : 's'} open`, days >= 21 ? 'red' : 'amber')}</div></a>`;
  }).join('')}</div>`
    : `<div class="card-body">${emptyState('check', 'No open requests')}</div>`;

  const backupList = backups.length ? `<div class="rows">${backups.slice(0, 7).map(b => `<div class="row"><span class="tl-dot">${icon('database', 15)}</span>
      <div class="row-main"><div class="row-title">${esc(fmtDay(b.date + 'T12:00:00Z'))}</div><div class="row-sub">${fmtSize(b.size)}</div></div>
      <a class="btn ghost sm" href="/admin/backup/${esc(b.date)}">${icon('download', 16)}Download</a></div>`).join('')}</div>`
    : `<div class="card-body">${emptyState('database', 'No backups yet', 'The first one is made by the next 8am run.')}</div>`;

  return shell({ title: 'Records', active: 'records', admin, badges, body: `
    ${pageHead('Records', 'Retention, legal holds, client data requests and backups')}
    ${flashHtml(flash)}
    <div class="stats">
      <div class="stat"><div class="stat-top"><span>Due for review</span><span class="stat-ic tone-amber">${icon('clock', 18)}</span></div><div class="stat-num">${due.length}</div><div class="stat-note">Past retention date</div></div>
      <div class="stat"><div class="stat-top"><span>Open requests</span><span class="stat-ic tone-blue">${icon('inbox', 18)}</span></div><div class="stat-num">${requests.length}</div><div class="stat-note">From clients</div></div>
      <div class="stat"><div class="stat-top"><span>Legal holds</span><span class="stat-ic tone-red">${icon('lock', 18)}</span></div><div class="stat-num">${holds.length}</div><div class="stat-note">Never erased</div></div>
      <div class="stat"><div class="stat-top"><span>Records kept</span><span class="stat-ic tone-green">${icon('shield', 18)}</span></div><div class="stat-num">${stats.kept}</div><div class="stat-note">${stats.erased} erased so far</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card"><div class="card-head"><h2>Due for review</h2></div>${dueList}</div>
      <div class="card"><div class="card-head"><h2>Open client requests</h2></div>${reqList}</div>
      <div class="card"><div class="card-head"><h2>Legal holds</h2></div>${holdList}</div>
      <div class="card"><div class="card-head"><h2>Backups</h2><span class="small muted">Kept 30 days</span></div>${backupList}</div>
    </div>
    <div class="note">${icon('shield', 18)}<span>Retention: applications are kept 6 years after closing (12 months if cancelled before any work); enquiries 12 months after last activity. Nothing is erased automatically — you approve every erasure, and each one is logged permanently.</span></div>` });
}

// ── Activity (audit log) ────────────────────────────────────────
export const ACTIVITY_FILTERS = [
  { key: 'all', label: 'All', prefix: null },
  { key: 'case', label: 'Cases', prefix: 'case.' },
  { key: 'document', label: 'Documents', prefix: 'document.' },
  { key: 'login', label: 'Sign-ins', prefix: 'login.' },
  { key: 'client', label: 'Clients & requests', prefix: 'client.' },
  { key: 'job', label: 'Daily job', prefix: 'job.' }
];

const ACTION_LABELS = {
  'case.created': 'New submission received', 'case.viewed': 'Case opened', 'case.status_changed': 'Status changed',
  'case.note_added': 'Note added', 'case.follow_up_set': 'Follow-up updated', 'case.reminder_sent': 'Automatic reminder sent',
  'case.tracked': 'Client checked status online', 'case.legal_hold': 'Legal hold changed', 'case.erased': 'Case erased',
  'document.viewed': 'Document opened', 'login.success': 'Signed in', 'login.failed': 'Wrong login code',
  'login.code_sent': 'Login code sent', 'logout': 'Signed out', 'job.daily': 'Morning job ran', 'track.failed': 'Failed status lookup',
  'client.viewed': 'Client opened', 'client.updated': 'Client details corrected', 'client.exported': 'Client data exported', 'client.erased': 'Client erased',
  'client.request_logged': 'Data request recorded', 'client.request_done': 'Data request completed', 'backup.downloaded': 'Backup downloaded'
};

export function activityPage({ admin, badges, rows, filter, nextBefore }) {
  const chips = ACTIVITY_FILTERS.map(f => `<a class="${f.key === filter ? 'on' : ''}" href="/admin/activity?filter=${f.key}">${esc(f.label)}</a>`).join('');
  const list = rows.length ? `<ul class="timeline" style="padding:0 18px">${rows.map(r => {
    let detail = {};
    try { detail = JSON.parse(r.detail || '{}') || {}; } catch (e) { /* ignore */ }
    const ref = detail.reference ? ` · ${detail.reference}` : '';
    const who = r.actor.startsWith('admin:') ? r.actor.slice(6) : (r.actor === 'client' ? 'client / visitor' : 'automatic');
    const link = r.entity_type === 'case' && r.entity_id ? `/admin/case/${esc(r.entity_id)}` : null;
    return `<li><span class="tl-dot">${icon(r.action.startsWith('login') || r.action === 'logout' ? 'lock' : r.action.startsWith('document') ? 'doc' : r.action.startsWith('job') ? 'clock' : 'activity', 15)}</span>
      <div class="tl-body">${link ? `<a href="${link}" style="text-decoration:none;color:inherit">` : ''}<strong>${esc(ACTION_LABELS[r.action] || r.action)}</strong>${esc(ref)}${link ? '</a>' : ''}
      <div class="small muted">${esc(fmtDate(r.at))} · ${esc(who)}</div></div></li>`;
  }).join('')}</ul>` : `<div class="card-body">${emptyState('activity', 'No activity')}</div>`;
  return shell({ title: 'Activity', active: 'activity', admin, badges, body: `
    ${pageHead('Activity log', 'A permanent record of every action — it cannot be edited or deleted')}
    <div class="chips">${chips}</div>
    <div class="card">${list}</div>
    ${nextBefore ? `<div class="btn-row"><a class="btn ghost" href="/admin/activity?filter=${esc(filter)}&before=${nextBefore}">Older entries ${icon('arrow', 16)}</a></div>` : ''}` });
}

export function notFoundPage({ admin, badges }) {
  return shell({ title: 'Not found', active: '', admin, badges, body: `<div class="card"><div class="card-body">${emptyState('alert', 'Not found', 'That case, client or document does not exist.')}<div style="text-align:center"><a class="btn ghost" href="/admin/">Back to overview</a></div></div></div>` });
}

export function simplePage(title, text) {
  return htmlDocument(title, `<div class="login-wrap"><div class="login"><div class="card"><h1>${esc(title)}</h1><p class="muted">${esc(text)}</p><a class="btn ghost" href="/admin/">Back</a></div></div></div>`);
}
