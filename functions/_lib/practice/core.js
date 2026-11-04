/**
 * Shared building blocks for the practice system (the back-office modules
 * of /admin): numbering, money, dates, firm settings, the team and roles,
 * and file storage. See ops/practice-system.md for the overview.
 */

// ── Numbering ────────────────────────────────────────────────────
/** Next yearly number for a prefix, e.g. INV-2026-0007. Shares the counters table with case references. */
export async function nextNumber(env, prefix) {
  const name = `${prefix}-${new Date().getUTCFullYear()}`;
  const row = await env.DB
    .prepare('INSERT INTO counters (name, value) VALUES (?1, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value')
    .bind(name).first();
  return `${name}-${String(row.value).padStart(4, '0')}`;
}

export function randomToken(bytes = 24) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Money (kobo) ─────────────────────────────────────────────────
/** "35,000.50" / "₦35000" / "35000" → 3500050 kobo. Returns null if not a valid amount. */
export function parseNaira(input) {
  const s = String(input ?? '').replace(/[₦,\s]/g, '').replace(/^NGN/i, '');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

/** 3500050 → "₦35,000.50"; whole naira amounts drop the kobo. */
export function naira(kobo, { symbol = true, always = false } = {}) {
  const k = Math.round(Number(kobo) || 0);
  const neg = k < 0;
  const abs = Math.abs(k);
  const whole = Math.floor(abs / 100).toLocaleString('en-NG');
  const frac = abs % 100;
  const text = `${whole}${frac || always ? `.${String(frac).padStart(2, '0')}` : ''}`;
  return `${neg ? '−' : ''}${symbol ? '₦' : ''}${text}`;
}

/** Plain number for an input box: 3500050 → "35000.50". */
export function nairaInput(kobo) {
  if (kobo === null || kobo === undefined || kobo === '') return '';
  const k = Math.round(Number(kobo));
  return k % 100 ? (k / 100).toFixed(2) : String(k / 100);
}

// ── Dates (Lagos is UTC+1 all year) ──────────────────────────────
export function lagosToday(now = new Date()) {
  return new Date(now.getTime() + 3600000).toISOString().slice(0, 10);
}

export function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime());
}

/** A date field from a form, or null. */
export function formDate(form, name) {
  const v = String(form.get(name) || '').trim();
  return isYmd(v) ? v : null;
}

/** Due moment for a date: 8am Lagos (07:00 UTC) on that day. */
export function dueIso(ymd) {
  return ymd ? `${ymd}T07:00:00.000Z` : null;
}

/** Whole days from today (Lagos) to a YYYY-MM-DD; negative when past. */
export function daysUntil(ymd, now = new Date()) {
  if (!ymd) return null;
  const today = new Date(`${lagosToday(now)}T12:00:00Z`).getTime();
  return Math.round((new Date(`${String(ymd).slice(0, 10)}T12:00:00Z`).getTime() - today) / 86400000);
}

/** "today", "tomorrow", "in 5 days", "3 days overdue". */
export function dueText(ymd, now = new Date()) {
  const d = daysUntil(ymd, now);
  if (d === null) return '';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return '1 day overdue';
  if (d < 0) return `${-d} days overdue`;
  return `in ${d} days`;
}

export function dueTone(ymd, now = new Date()) {
  const d = daysUntil(ymd, now);
  if (d === null) return 'grey';
  if (d < 0) return 'red';
  if (d <= 2) return 'amber';
  return 'blue';
}

/** Trimmed text field, capped, or null when empty. */
export function text(form, name, max = 500) {
  const v = String(form.get(name) ?? '').trim().slice(0, max);
  return v || null;
}

export function pick(form, name, allowed, fallback) {
  const v = String(form.get(name) || '');
  return Object.prototype.hasOwnProperty.call(allowed, v) ? v : fallback;
}

export function likePattern(q) {
  return `%${q.replace(/[%_\\]/g, m => '\\' + m)}%`;
}

// ── Firm settings ────────────────────────────────────────────────
// Everything that names the firm on invoices, receipts and client links.
// Changing these in Settings is how the system is handed to a new owner or
// set up for another firm.
export const SETTING_FIELDS = [
  { key: 'firm_name', label: 'Trading name', def: 'Awal Global Consults', group: 'Firm' },
  { key: 'legal_name', label: 'Registered name', def: 'Awal Global Consults Limited', group: 'Firm' },
  { key: 'rc_number', label: 'RC number', def: 'RC-9282103', group: 'Firm' },
  { key: 'tagline', label: 'Tagline', def: 'Legal, Governance, Risk & Compliance', group: 'Firm' },
  { key: 'address', label: 'Office address', def: 'Lagos, Nigeria', group: 'Firm', textarea: true },
  { key: 'email', label: 'Email', def: 'info@awalglobal.com.ng', group: 'Firm' },
  { key: 'phone', label: 'Phone / WhatsApp', def: '+234 703 833 6596', group: 'Firm' },
  { key: 'website', label: 'Website', def: 'https://awalglobal.com.ng', group: 'Firm' },
  { key: 'tin', label: 'TIN', def: '', group: 'Tax' },
  { key: 'vat_rate', label: 'VAT rate on fees (%)', def: '7.5', group: 'Tax', hint: 'Applied to professional fees only. Disbursements (agency fees paid for the client) carry no VAT. Set 0 if the firm is not VAT-registered.' },
  { key: 'bank_name', label: 'Bank', def: 'Kuda Bank', group: 'Payments' },
  { key: 'bank_account_name', label: 'Account name', def: 'AWAL GLOBAL CONSULTS LIMITED', group: 'Payments' },
  { key: 'bank_account_number', label: 'Account number', def: '3003466189', group: 'Payments' },
  { key: 'invoice_due_days', label: 'Invoice due after (days)', def: '7', group: 'Payments' },
  { key: 'quote_valid_days', label: 'Quotes valid for (days)', def: '14', group: 'Payments' },
  { key: 'invoice_footer', label: 'Invoice footer', def: 'Thank you for your business. Please quote the invoice number as the payment reference.', group: 'Payments', textarea: true }
];

export async function getSettings(env) {
  const out = {};
  for (const f of SETTING_FIELDS) out[f.key] = f.def;
  try {
    const rows = (await env.DB.prepare('SELECT key, value FROM settings').all()).results || [];
    for (const r of rows) out[r.key] = r.value;
  } catch (err) {
    console.error('settings: could not read:', err && err.message);
  }
  return out;
}

/** VAT rate in basis points from settings ("7.5" → 750). */
export function vatBp(settings) {
  const n = Number(String(settings.vat_rate || '0').replace('%', ''));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : 0;
}

// ── Team and roles ───────────────────────────────────────────────
export const ROLES = {
  owner: { label: 'Owner', note: 'Everything, including team, settings, erasure and voiding invoices' },
  staff: { label: 'Staff', note: 'Day-to-day work: matters, billing, register, library and tasks' },
  viewer: { label: 'Viewer', note: 'Read only, e.g. an external accountant or auditor' }
};

/** Everyone who can be assigned work: active team members, plus env owners not yet in the table. */
export async function teamList(env, envOwners = []) {
  const rows = (await env.DB.prepare('SELECT email, full_name, role, title FROM staff WHERE active = 1 ORDER BY full_name').all()).results || [];
  const listed = new Set(rows.map(r => r.email));
  for (const e of envOwners) if (!listed.has(e)) rows.push({ email: e, full_name: e, role: 'owner', title: null });
  return rows;
}

export function personName(team, email) {
  if (!email) return null;
  const m = team.find(t => t.email === email);
  return m ? m.full_name : email;
}

// ── File storage (R2) ───────────────────────────────────────────
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const UPLOAD_TYPES = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', csv: 'text/csv', zip: 'application/zip', eml: 'message/rfc822', msg: 'application/vnd.ms-outlook'
};
// Opened in the browser; everything else downloads
const INLINE_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);

export function fileExt(name) {
  return ((/\.([a-z0-9]+)$/i.exec(String(name || '')) || [])[1] || '').toLowerCase();
}

export function allowedUpload(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) return 'Choose a file to upload.';
  if (file.size > MAX_UPLOAD_BYTES) return 'That file is larger than 20 MB.';
  if (!UPLOAD_TYPES[fileExt(file.name)]) return 'That type of file is not accepted. Use PDF, an image, Word, Excel, PowerPoint, text, CSV, email or ZIP.';
  return null;
}

export function cleanFileName(name) {
  return String(name || 'file').replace(/[\\/\r\n"]/g, '_').slice(-150);
}

/** Response headers for serving a stored file safely: the type comes from the extension only. */
export function fileHeaders(fileName, securityHeaders) {
  const ext = fileExt(fileName);
  const type = UPLOAD_TYPES[ext] && ext !== 'txt' && ext !== 'csv' ? UPLOAD_TYPES[ext] : (ext === 'txt' || ext === 'csv' ? 'text/plain; charset=utf-8' : 'application/octet-stream');
  const safe = cleanFileName(fileName);
  return {
    ...securityHeaders,
    'Content-Type': INLINE_EXT.has(ext) ? type : (ext === 'txt' || ext === 'csv' ? type : 'application/octet-stream'),
    'Content-Disposition': `${INLINE_EXT.has(ext) || ext === 'txt' || ext === 'csv' ? 'inline' : 'attachment'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'none'"
  };
}
