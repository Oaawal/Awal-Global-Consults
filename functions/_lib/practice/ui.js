/**
 * Form fields, small widgets and the messages shown after actions, shared by
 * the practice modules. Pages are server-rendered and script-free, like the
 * rest of the dashboard.
 */
import { esc, icon, pill, emptyState } from '../admin-ui.js';
import { dueText, dueTone, naira, nairaInput } from './core.js';

export { esc, icon, pill, emptyState };

// Messages shown after an action (?done=key)
const FLASH = {
  saved: ['ok', 'Saved.'],
  created: ['ok', 'Created.'],
  deleted: ['ok', 'Removed.'],
  invalid: ['err', 'Some details are missing or not valid. Please check the form and try again.'],
  forbidden: ['err', 'Your role does not allow that. Ask an owner.'],
  uploaded: ['ok', 'File uploaded and stored privately.'],
  upload_failed: ['err', 'The file could not be uploaded. Use PDF, an image, Word, Excel, text, CSV, email or ZIP, up to 20 MB.'],
  file_removed: ['ok', 'File removed from the list. It stays in storage until the record is erased, so nothing is lost by mistake.'],
  matter_created: ['ok', 'Matter opened. Add documents, tasks or a quote below.'],
  assigned: ['ok', 'Matter assigned.'],
  task_done: ['ok', 'Task done.'],
  task_reopened: ['ok', 'Task reopened.'],
  task_saved: ['ok', 'Task saved.'],
  invoice_saved: ['ok', 'Draft saved.'],
  invoice_issued: ['ok', 'Issued. It can no longer be edited; void it and issue a new one if it needs to change.'],
  invoice_sent: ['ok', 'Emailed to the client with a link to view, print or save it.'],
  invoice_send_failed: ['err', 'The email could not be sent. Copy the client link and send it on WhatsApp instead.'],
  invoice_no_email: ['err', 'This client has no email address. Copy the client link and send it on WhatsApp.'],
  invoice_void: ['ok', 'Voided. It stays on record with the reason.'],
  invoice_converted: ['ok', 'Invoice created from the quote. Check it, then issue it.'],
  invoice_empty: ['err', 'Add at least one line with a description and an amount.'],
  invoice_locked: ['err', 'Only drafts can be edited.'],
  payment_recorded: ['ok', 'Payment recorded and receipt numbered.'],
  payment_emailed: ['ok', 'Payment recorded and the receipt was emailed to the client.'],
  payment_invalid: ['err', 'Enter an amount and the date it was paid.'],
  payment_too_much: ['err', 'That is more than the balance due.'],
  payment_reversed: ['ok', 'Payment reversed. It stays on record with the reason.'],
  reason_needed: ['err', 'Please give a reason. It is kept on record.'],
  member_added: ['ok', 'Team member added. They can sign in with their email address straight away.'],
  member_updated: ['ok', 'Team member updated.'],
  member_deactivated: ['ok', 'Deactivated and signed out everywhere. Their work and history are kept.'],
  member_self: ['err', 'You cannot change your own role or deactivate yourself. Ask another owner.'],
  member_env: ['err', 'This owner is set in the ADMIN_EMAILS variable on Cloudflare, so the role cannot be changed here.'],
  settings_saved: ['ok', 'Settings saved. New invoices, receipts and client links use them straight away.'],
  corr_saved: ['ok', 'Register entry saved.'],
  status_saved: ['ok', 'Status updated.']
};

export function practiceFlash(key) {
  return FLASH[key] || null;
}

// ── Form fields ──────────────────────────────────────────────────
function attrs(o) {
  return Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`)).join('');
}

/** Labelled input. opts: type, value, required, placeholder, max, hint, cls, list, inputmode */
export function field(name, label, opts = {}) {
  const id = opts.id || `f-${name}`;
  return `<div class="${opts.cls || ''}"><label for="${id}" class="${opts.required ? 'req' : ''}">${esc(label)}</label>
    <input${attrs({ id, name, type: opts.type || 'text', value: opts.value ?? '', required: !!opts.required, placeholder: opts.placeholder, maxlength: opts.max || 300, list: opts.list, inputmode: opts.inputmode, autocomplete: opts.autocomplete || 'off', step: opts.step, min: opts.min })}>
    ${opts.hint ? `<div class="hint">${esc(opts.hint)}</div>` : ''}</div>`;
}

export function area(name, label, opts = {}) {
  const id = opts.id || `f-${name}`;
  return `<div class="${opts.cls || 'full'}"><label for="${id}" class="${opts.required ? 'req' : ''}">${esc(label)}</label>
    <textarea${attrs({ id, name, required: !!opts.required, placeholder: opts.placeholder, maxlength: opts.max || 2000 })}>${esc(opts.value ?? '')}</textarea>
    ${opts.hint ? `<div class="hint">${esc(opts.hint)}</div>` : ''}</div>`;
}

/** options: { value: label } or [[value, label]] */
export function select(name, label, options, opts = {}) {
  const id = opts.id || `f-${name}`;
  const list = Array.isArray(options) ? options : Object.entries(options).map(([k, v]) => [k, typeof v === 'string' ? v : v.label]);
  return `<div class="${opts.cls || ''}"><label for="${id}" class="${opts.required ? 'req' : ''}">${esc(label)}</label>
    <select${attrs({ id, name, required: !!opts.required })}>${opts.blank !== undefined ? `<option value="">${esc(opts.blank)}</option>` : ''}${list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(opts.value ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
    ${opts.hint ? `<div class="hint">${esc(opts.hint)}</div>` : ''}</div>`;
}

export function moneyField(name, label, kobo, opts = {}) {
  return field(name, label, { ...opts, value: nairaInput(kobo), inputmode: 'decimal', placeholder: opts.placeholder || '0.00', max: 20 });
}

export function teamSelect(team, name, label, value, opts = {}) {
  return select(name, label, team.map(t => [t.email, t.full_name === t.email ? t.email : `${t.full_name}${t.title ? ` · ${t.title}` : ''}`]), { blank: opts.blank ?? 'Nobody yet', value, ...opts });
}

/** Matter picker: open matters, newest first. */
export function caseSelect(cases, name, label, value, opts = {}) {
  return select(name, label, cases.map(c => [c.id, `${c.reference} · ${c.full_name}${c.services ? ` · ${c.services}` : ''}`.slice(0, 110)]), { blank: opts.blank ?? 'Not linked to a matter', value, ...opts });
}

export async function openCases(env, include = null) {
  return (await env.DB.prepare(
    `SELECT c.id, c.reference, c.services, cl.full_name FROM cases c JOIN clients cl ON cl.id = c.client_id
     WHERE (c.status NOT IN ('closed', 'cancelled', 'converted') AND c.purged_at IS NULL) OR c.id = ?1
     ORDER BY c.created_at DESC LIMIT 400`
  ).bind(include).all()).results || [];
}

export function fileInput(name = 'file', label = 'File', opts = {}) {
  return `<div class="${opts.cls || 'full'}"><label for="f-${name}" class="${opts.required ? 'req' : ''}">${esc(label)}</label>
    <div class="file-drop"><input id="f-${name}" name="${name}" type="file"${opts.required ? ' required' : ''} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.eml,.msg"></div>
    <div class="hint">PDF, images, Word, Excel, PowerPoint, text, CSV, email or ZIP. Up to 20 MB. Stored privately.</div></div>`;
}

export function hidden(name, value) {
  return `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;
}

// ── Small widgets ────────────────────────────────────────────────
export function dueBadge(ymd, now = new Date()) {
  if (!ymd) return '';
  return pill(dueText(ymd, now), dueTone(ymd, now));
}

export function card(title, body, { right = '', pad = true } = {}) {
  return `<div class="card">${title ? `<div class="card-head"><h2>${esc(title)}</h2>${right}</div>` : ''}${pad ? `<div class="card-body">${body}</div>` : body}</div>`;
}

export function chips(items, active) {
  return `<div class="chips">${items.map(i => `<a class="${i.key === active ? 'on' : ''}" href="${esc(i.href)}">${esc(i.label)}${i.n !== undefined ? ` <span class="n">${i.n}</span>` : ''}</a>`).join('')}</div>`;
}

export function moneyCell(kobo) {
  return `<span class="money">${esc(naira(kobo))}</span>`;
}

export function readOnlyNote(role) {
  return role === 'viewer' ? `<div class="note" style="margin-bottom:16px">${icon('lock', 18)}<span>You have read-only access.</span></div>` : '';
}

/** "Details" disclosure holding a form, used for add/edit panels. */
export function disclosure(summary, inner, open = false) {
  return `<details class="more"${open ? ' open' : ''} style="border-top:0;margin-top:0;padding-top:0"><summary>${esc(summary)}</summary>${inner}</details>`;
}

export function fmtYmd(ymd) {
  if (!ymd) return '—';
  return new Date(`${String(ymd).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function linkRow(href, iconName, tone, title, sub, side = '') {
  return `<a class="row" href="${esc(href)}"><span class="stat-ic tone-${tone}" style="width:36px;height:36px">${icon(iconName, 17)}</span>
    <div class="row-main"><div class="row-title">${esc(title)}</div>${sub ? `<div class="row-sub">${esc(sub)}</div>` : ''}</div>${side ? `<div class="row-side">${side}</div>` : ''}</a>`;
}
