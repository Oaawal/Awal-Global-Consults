/**
 * Adding clients served before the website records existed (from email, WhatsApp,
 * phone or walk-ins), one at a time or from a spreadsheet (CSV), and counting the
 * people whose personal data the business holds (for the NDPC "200 data subjects
 * in six months" test).
 *
 * Past records keep their real date, get a reference in that year (e.g. AGC-2025-0003),
 * and follow the normal retention rules from that date. Only the minimum is recorded:
 * name, contact, service, date, status and the names of other people on the file.
 */

import { retentionFor } from './cases.js';

export const CHANNELS = ['WhatsApp', 'Email', 'Phone call', 'Walk-in', 'Referral', 'Other'];
export const PAST_STATUSES = [
  { key: 'closed', label: 'Completed (closed)' },
  { key: 'delivered', label: 'Delivered, not yet closed' },
  { key: 'filed', label: 'Still in progress (filed with agency)' },
  { key: 'awaiting_documents', label: 'Still in progress (waiting for documents)' },
  { key: 'cancelled', label: 'Cancelled / did not go ahead' }
];
export const CSV_HEADERS = ['Full name', 'Phone', 'Email', 'Service', 'Date (YYYY-MM-DD)', 'Status', 'Channel', 'Other people named', 'Notes'];
const MAX_ROWS = 500;
const ACTOR_SYSTEM = 'system:import';

async function referenceForYear(env, prefix, year) {
  const name = `${prefix}-${year}`;
  const row = await env.DB.prepare('INSERT INTO counters (name, value) VALUES (?1, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value').bind(name).first();
  return `${name}-${String(row.value).padStart(4, '0')}`;
}

function clean(v, max = 200) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }

/** Normalise and check one past record. Returns { record } or { error }. */
export function validatePast(raw) {
  const r = {
    fullName: clean(raw.fullName, 120), phone: clean(raw.phone, 40), email: clean(raw.email, 254).toLowerCase(),
    service: clean(raw.service, 200), date: clean(raw.date, 10), channel: clean(raw.channel, 40) || 'Other',
    status: clean(raw.status, 40).toLowerCase(), people: clean(raw.people, 2000), notes: clean(raw.notes, 2000),
    kind: raw.kind === 'enquiry' ? 'enquiry' : 'application'
  };
  if (r.fullName.split(/\s+/).length < 2) return { error: 'Full name (first and last) is required' };
  if (!r.phone && !r.email) return { error: 'A phone number or email is required' };
  if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email)) return { error: `Email "${r.email}" doesn't look right` };
  if (!r.service) return { error: 'Service is required' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || isNaN(Date.parse(r.date))) return { error: `Date "${r.date}" must be YYYY-MM-DD` };
  if (new Date(r.date) > new Date()) return { error: 'Date cannot be in the future' };
  if (new Date(r.date) < new Date('2015-01-01')) return { error: 'Date is too far back' };
  const statusMap = { closed: 'closed', completed: 'closed', done: 'closed', delivered: 'delivered', 'in progress': 'filed', filed: 'filed', progress: 'filed',
    'awaiting documents': 'awaiting_documents', awaiting_documents: 'awaiting_documents', waiting: 'awaiting_documents', cancelled: 'cancelled', canceled: 'cancelled' };
  r.status = statusMap[r.status] || (PAST_STATUSES.some(s => s.key === r.status) ? r.status : 'closed');
  if (r.kind === 'enquiry') r.status = r.status === 'cancelled' ? 'closed' : (r.status === 'closed' ? 'closed' : 'contacted');
  if (!CHANNELS.includes(r.channel)) r.channel = CHANNELS.find(c => c.toLowerCase() === r.channel.toLowerCase()) || 'Other';
  r.peopleList = r.people.split(/[;\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 20);
  return { record: r };
}

/** Save one validated past record. Returns { reference, caseId, duplicate? }. */
export async function savePast(env, request, actor, r) {
  const createdAt = new Date(`${r.date}T09:00:00Z`).toISOString();
  // Skip exact repeats (same contact, service and date) so a CSV can be uploaded twice safely
  const dup = await env.DB.prepare(
    `SELECT c.reference FROM cases c JOIN clients cl ON cl.id = c.client_id
     WHERE substr(c.created_at, 1, 10) = ?1 AND c.services = ?2 AND ((?3 != '' AND lower(cl.email) = ?3) OR (?4 != '' AND cl.phone = ?4)) LIMIT 1`
  ).bind(r.date, r.service, r.email, r.phone).first();
  if (dup) return { duplicate: true, reference: dup.reference };

  const existing = r.email
    ? await env.DB.prepare('SELECT id FROM clients WHERE email = ?1 AND anonymised_at IS NULL LIMIT 1').bind(r.email).first()
    : await env.DB.prepare('SELECT id FROM clients WHERE phone = ?1 AND anonymised_at IS NULL LIMIT 1').bind(r.phone).first();
  const clientId = existing ? existing.id : crypto.randomUUID();
  const caseId = crypto.randomUUID();
  const reference = await referenceForYear(env, r.kind === 'enquiry' ? 'ENQ' : 'AGC', r.date.slice(0, 4));
  const ret = retentionFor(r.kind, r.status, createdAt);
  const fields = { 'Added from': `${r.channel} (before the website records)`, 'Service date': r.date };
  if (r.peopleList.length) fields['Other people named'] = r.peopleList.join('; ');
  if (r.notes) fields['Notes'] = r.notes;
  const now = new Date().toISOString();
  const ip = request.headers.get('CF-Connecting-IP');
  await env.DB.batch([
    existing
      ? env.DB.prepare('UPDATE clients SET phone = COALESCE(phone, NULLIF(?2, \'\')), email = COALESCE(email, NULLIF(?3, \'\')), updated_at = ?4 WHERE id = ?1').bind(clientId, r.phone, r.email, now)
      : env.DB.prepare('INSERT INTO clients (id, full_name, email, phone, created_at, updated_at) VALUES (?1, ?2, NULLIF(?3, \'\'), NULLIF(?4, \'\'), ?5, ?5)').bind(clientId, r.fullName, r.email, r.phone, createdAt),
    env.DB.prepare(
      `INSERT INTO cases (id, reference, client_id, kind, services, status, form_data, consent_accuracy, consent_processing, source_page,
                          created_at, updated_at, status_changed_at, retention_class, closed_at, retain_until)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, ?8, ?9, ?9, ?9, ?4, ?10, ?11)`
    ).bind(caseId, reference, clientId, r.kind, r.service, r.status, JSON.stringify(fields), `manual:${r.channel}`, createdAt, ret.closedAt, ret.retainUntil),
    env.DB.prepare("INSERT INTO case_events (case_id, event, to_status, note, actor, created_at) VALUES (?1, 'created', ?2, ?3, ?4, ?5)")
      .bind(caseId, r.status, `Added from ${r.channel} records (service date ${r.date})`, actor, now),
    env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, ?2, 'case.imported', 'case', ?3, ?4, ?5)")
      .bind(now, actor, caseId, JSON.stringify({ reference, channel: r.channel, people: r.peopleList.length, newClient: !existing }), ip)
  ]);
  return { reference, caseId };
}

/** Minimal CSV parser (quotes, commas, newlines in quotes, BOM). */
export function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}

/** Import a CSV. Returns { added: [...], skipped: [...], errors: [{line, error}] }. */
export async function importCsv(env, request, actor, text, kind) {
  const rows = parseCsv(text);
  if (!rows.length) return { added: [], skipped: [], errors: [{ line: 0, error: 'The file is empty' }] };
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = name => head.findIndex(h => h.startsWith(name));
  const idx = { name: col('full name'), phone: col('phone'), email: col('email'), service: col('service'), date: col('date'), status: col('status'), channel: col('channel'), people: col('other people'), notes: col('notes') };
  if (idx.name < 0 || idx.service < 0 || idx.date < 0) return { added: [], skipped: [], errors: [{ line: 1, error: 'Use the template: the first row must have the column names (Full name, Phone, Email, Service, Date...)' }] };
  const out = { added: [], skipped: [], errors: [] };
  const body = rows.slice(1, MAX_ROWS + 1);
  for (let i = 0; i < body.length; i++) {
    const r = body[i]; const get = k => (idx[k] >= 0 ? r[idx[k]] : '');
    const v = validatePast({ kind, fullName: get('name'), phone: get('phone'), email: get('email'), service: get('service'), date: get('date'), status: get('status'), channel: get('channel'), people: get('people'), notes: get('notes') });
    if (v.error) { out.errors.push({ line: i + 2, error: v.error }); continue; }
    try {
      const res = await savePast(env, request, actor, v.record);
      (res.duplicate ? out.skipped : out.added).push({ line: i + 2, reference: res.reference, name: v.record.fullName });
    } catch (err) { out.errors.push({ line: i + 2, error: 'Could not be saved' }); }
  }
  if (rows.length - 1 > MAX_ROWS) out.errors.push({ line: MAX_ROWS + 2, error: `Only the first ${MAX_ROWS} rows were read; upload the rest separately` });
  return out;
}

export function csvTemplate() {
  const esc = v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const rows = [CSV_HEADERS,
    ['Ada Obi', '08031234567', 'ada@gmail.com', 'Business Name Registration', '2025-08-14', 'closed', 'WhatsApp', '', 'Paid in full'],
    ['Chidi Okafor', '08039876543', '', 'Limited Company Registration', '2025-11-02', 'closed', 'WhatsApp', 'Ngozi Okafor; Emeka Okafor', 'Two other directors']];
  return '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

/** People whose personal data we hold: unique clients, other people named on their files, and newsletter subscribers. */
export async function dataSubjectCount(env, sinceIso = null) {
  const casesSql = sinceIso
    ? "SELECT c.client_id, c.form_data FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE cl.anonymised_at IS NULL AND c.purged_at IS NULL AND (c.created_at >= ?1 OR c.updated_at >= ?1)"
    : "SELECT c.client_id, c.form_data FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE cl.anonymised_at IS NULL AND c.purged_at IS NULL";
  const subsSql = sinceIso
    ? "SELECT COUNT(*) AS n FROM subscribers WHERE status != 'unsubscribed' AND created_at >= ?1"
    : "SELECT COUNT(*) AS n FROM subscribers WHERE status != 'unsubscribed'";
  const [cases, subs] = await env.DB.batch([
    sinceIso ? env.DB.prepare(casesSql).bind(sinceIso) : env.DB.prepare(casesSql),
    sinceIso ? env.DB.prepare(subsSql).bind(sinceIso) : env.DB.prepare(subsSql)
  ]);
  const clients = new Set(); const others = new Set();
  for (const row of cases.results || []) {
    clients.add(row.client_id);
    let fd = {}; try { fd = JSON.parse(row.form_data || '{}') || {}; } catch (e) {}
    for (const [k, v] of Object.entries(fd)) {
      if (!v) continue;
      if (/^Person \d+ Full Name$/.test(k) || k === 'Passport Next of Kin Name') others.add(String(v).trim().toLowerCase());
      if (k === 'Other people named') String(v).split(';').map(s => s.trim().toLowerCase()).filter(Boolean).forEach(n => others.add(n));
    }
  }
  const subscribers = (subs.results || [])[0]?.n || 0;
  return { clients: clients.size, others: others.size, subscribers, total: clients.size + others.size + subscribers };
}
