/**
 * Dashboard security monitoring and document backups.
 *
 * - Sign-in alerts: every authorised admin is emailed when someone signs in
 *   from a device or country not seen for that address in the last 120 days,
 *   and when a login code is entered wrongly 3 times within 30 minutes.
 * - "Sign out all devices" ends every session for an address.
 * - Document backups: client documents are copied each night to a separate
 *   private bucket (binding DOCS_BACKUP). Copies of erased documents are removed
 *   within BACKUP_KEEP_DAYS, matching the database backup window.
 * - Backup check: each night the latest database backup is read back and
 *   compared with what was written, and a sample of document copies is checked.
 */

import { adminEmails } from './admin-auth.js';
import { sendBrevoEmail } from './brevo.js';
import { securityAlertEmail } from './email-templates.js';

const SITE_URL = 'https://awalglobal.com.ng';
const KNOWN_DEVICE_DAYS = 120;
const FAILED_ALERT_THRESHOLD = 3;
const FAILED_WINDOW_MINUTES = 30;
const BACKUP_KEEP_DAYS = 30;
const MAX_COPIES_PER_RUN = 150;
const VERIFY_SAMPLE = 3;

function requestInfo(request) {
  const cf = request.cf || {};
  const ua = (request.headers.get('User-Agent') || '').slice(0, 200);
  return {
    ip: request.headers.get('CF-Connecting-IP') || 'unknown',
    country: cf.country || 'unknown',
    city: cf.city || '',
    ua,
    browser: describeBrowser(ua)
  };
}

function describeBrowser(ua) {
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Unknown system';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Unknown browser';
  return `${br} on ${os}`;
}

function lagosTime(d = new Date()) {
  return d.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

async function alertAdmins(env, subject, html) {
  for (const email of adminEmails(env)) {
    try { await sendBrevoEmail(env, { to: { email }, subject, html }); }
    catch (err) { console.error('security alert email failed:', err && err.message); }
  }
}

/** Call BEFORE creating the new session: is this device/country new for this address? */
export async function isNewDevice(env, email, request) {
  const { ua } = requestInfo(request);
  const since = new Date(Date.now() - KNOWN_DEVICE_DAYS * 86400000).toISOString();
  const row = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE actor = ?1 AND action = 'login.success' AND at > ?2 AND json_extract(detail, '$.ua') = ?3 AND json_extract(detail, '$.country') = ?4")
    .bind(`admin:${email}`, since, ua, (request.cf && request.cf.country) || 'unknown').first();
  return !row || row.n === 0;
}

/** Details stored with each successful sign-in so later sign-ins can be compared. */
export function signInDetail(request) {
  const { ua, country, browser } = requestInfo(request);
  return { ua, country, browser };
}

export async function alertNewSignIn(env, email, request) {
  const i = requestInfo(request);
  await alertAdmins(env, 'Security alert: new sign-in to the Awal dashboard', securityAlertEmail({
    title: 'New sign-in to the dashboard',
    intro: `${email} signed in from a device or country not used in the last ${KNOWN_DEVICE_DAYS} days.`,
    rows: [['When', lagosTime()], ['Device', i.browser], ['Location', [i.city, i.country].filter(Boolean).join(', ')], ['IP address', i.ip]],
    action: 'If this was you, you can ignore this email. If it was not, sign in and choose "Sign out all devices" on the Records page, then check the Activity log.',
    buttonUrl: `${SITE_URL}/admin/records#security`, buttonLabel: 'Open security settings'
  }));
}

/** Call after a failed code. Alerts once when failures reach the threshold within the window. */
export async function noteFailedCode(env, email, request) {
  const since = new Date(Date.now() - FAILED_WINDOW_MINUTES * 60000).toISOString();
  const row = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE actor = ?1 AND action = 'login.failed' AND at > ?2")
    .bind(`admin:${email}`, since).first();
  if (!row || row.n !== FAILED_ALERT_THRESHOLD) return;
  const i = requestInfo(request);
  await alertAdmins(env, 'Security alert: repeated wrong login codes', securityAlertEmail({
    title: 'Repeated wrong login codes',
    intro: `A wrong login code was entered ${FAILED_ALERT_THRESHOLD} times in ${FAILED_WINDOW_MINUTES} minutes for ${email}.`,
    rows: [['When', lagosTime()], ['Device', i.browser], ['Location', [i.city, i.country].filter(Boolean).join(', ')], ['IP address', i.ip]],
    action: 'Nobody can sign in without a code from your inbox, and each code locks after 5 wrong tries. If this was not you, make sure your email account is secure (strong password and two-step verification).',
    buttonUrl: `${SITE_URL}/admin/activity`, buttonLabel: 'View activity log'
  }));
}

export async function revokeAllSessions(env, email) {
  const r = await env.DB.prepare('DELETE FROM admin_sessions WHERE email = ?1').bind(email.toLowerCase()).run();
  return (r.meta && r.meta.changes) || 0;
}

/** Recent sign-in activity for the Records page and the daily summary. */
export async function recentSignIns(env, sinceIso, limit = 10) {
  const rows = (await env.DB.prepare(
    "SELECT at, actor, action, detail, ip FROM audit_log WHERE action IN ('login.success', 'login.failed') AND at > ?1 ORDER BY at DESC LIMIT ?2"
  ).bind(sinceIso, limit).all()).results || [];
  return rows.map(r => {
    let d = {}; try { d = JSON.parse(r.detail || '{}') || {}; } catch (e) {}
    return { at: r.at, email: r.actor.replace(/^admin:/, ''), ok: r.action === 'login.success', browser: d.browser || '', country: d.country || '', ip: r.ip || '' };
  });
}

/** Copy client documents to the backup bucket and remove copies of erased documents. */
export async function backupDocuments(env) {
  if (!env.DOCS_BACKUP) return { enabled: false };
  // A replaced or removed file is kept (and stays backed up) until its case is erased, so a
  // document only counts as gone once the case's records have been purged.
  const docs = (await env.DB.prepare(
    'SELECT d.storage_key, d.size_bytes, CASE WHEN c.purged_at IS NOT NULL THEN d.deleted_at END AS deleted_at FROM documents d JOIN cases c ON c.id = d.case_id').all()).results || [];
  const cutoff = new Date(Date.now() - BACKUP_KEEP_DAYS * 86400000).toISOString();
  const byKey = new Map(docs.map(d => [d.storage_key, d]));

  const existing = new Map();
  let cursor;
  do {
    const page = await env.DOCS_BACKUP.list({ cursor, limit: 1000 });
    for (const o of page.objects || []) existing.set(o.key, o.size);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  let copied = 0, missing = 0, pending = 0, removed = 0;
  for (const d of docs) {
    if (d.deleted_at) continue;
    if (existing.get(d.storage_key) === d.size_bytes) continue;
    if (copied >= MAX_COPIES_PER_RUN) { pending++; continue; }
    const obj = await env.DOCS.get(d.storage_key);
    if (!obj) { missing++; continue; }
    await env.DOCS_BACKUP.put(d.storage_key, obj.body, { httpMetadata: obj.httpMetadata, customMetadata: obj.customMetadata });
    copied++;
  }
  for (const [key] of existing) {
    const d = byKey.get(key);
    if ((d && d.deleted_at && d.deleted_at < cutoff) || !d) { await env.DOCS_BACKUP.delete(key); removed++; }
  }
  const live = docs.filter(d => !d.deleted_at).length;
  return { enabled: true, live, copied, pending, missing, removed };
}

/** Read back the latest database backup and a sample of document copies. */
export async function verifyBackups(env, runDate, expected) {
  const result = { ok: true, problems: [] };
  const obj = await env.DOCS.get(`backups/${runDate}.json`);
  if (!obj) { result.ok = false; result.problems.push('Tonight\'s database backup could not be read back.'); return result; }
  const text = await obj.text();
  if (expected && text.length !== expected.bytes) { result.ok = false; result.problems.push('The database backup read back at a different size from what was written.'); }
  try {
    const dump = JSON.parse(text);
    const tables = Object.keys(dump.tables || {});
    if (expected && expected.tables && tables.length !== expected.tables) { result.ok = false; result.problems.push('The database backup is missing tables.'); }
    result.rows = tables.reduce((n, t) => n + (dump.tables[t] || []).length, 0);
  } catch (e) {
    result.ok = false; result.problems.push('The database backup is not valid JSON.');
  }
  if (env.DOCS_BACKUP) {
    const sample = (await env.DB.prepare('SELECT storage_key, size_bytes FROM documents WHERE deleted_at IS NULL ORDER BY RANDOM() LIMIT ?1').bind(VERIFY_SAMPLE).all()).results || [];
    let checked = 0;
    for (const d of sample) {
      const copy = await env.DOCS_BACKUP.head(d.storage_key);
      if (!copy) continue; // not copied yet (pending); reported by backupDocuments
      checked++;
      if (copy.size !== d.size_bytes) { result.ok = false; result.problems.push(`A document backup copy has the wrong size (${d.storage_key.split('/').pop()}).`); }
    }
    result.documentsChecked = checked;
  }
  return result;
}
