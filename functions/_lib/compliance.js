/**
 * Record-keeping tools: erasing personal data when the retention period ends
 * (or on a client's request), exporting what we hold about a client, and the
 * nightly database backup.
 *
 * Erasing a case deletes its documents from storage and clears the personal
 * data from the database, but keeps a stub row (reference, service, dates,
 * status) so there is a record that the case existed and when it was erased.
 * The audit log is never altered.
 */

import { isOpen } from './cases.js';

const BACKUP_PREFIX = 'backups/';
const BACKUP_KEEP_DAYS = 30; // erased data disappears from backups within this many days

// Reasons for erasing before the retention date; anything else must wait for it
export const EARLY_ERASE_REASONS = {
  test: 'Test or duplicate entry',
  error: 'Submitted in error / never a real client'
};

/**
 * Why a case cannot be erased yet, or null if it can.
 * `early` is set when erasing before the retention date (test or duplicate entries only).
 */
export function eraseBlocker(c, now, early = false) {
  if (c.purged_at) return 'Already erased.';
  if (c.legal_hold) return 'This case is on legal hold. Release the hold first.';
  if (early) return null;
  if (!c.retain_until) return 'The case is still open, so its records must be kept.';
  if (c.retain_until > now) return `The law requires keeping these records until ${c.retain_until.slice(0, 10)}.`;
  return null;
}

/** Erase one case's documents and personal data. Returns the number of files deleted. */
export async function eraseCase(env, c, { actor, reason, ip }) {
  const now = new Date().toISOString();
  const docs = (await env.DB.prepare('SELECT id, storage_key FROM documents WHERE case_id = ?1 AND deleted_at IS NULL').bind(c.id).all()).results || [];
  for (const d of docs) await env.DOCS.delete(d.storage_key);

  // The client record is erased too once none of their cases hold data any more
  const others = await env.DB.prepare('SELECT COUNT(*) AS n FROM cases WHERE client_id = ?1 AND id != ?2 AND purged_at IS NULL')
    .bind(c.client_id, c.id).first();
  const eraseClient = !others || others.n === 0;

  const statements = [
    env.DB.prepare('UPDATE documents SET deleted_at = ?2 WHERE case_id = ?1 AND deleted_at IS NULL').bind(c.id, now),
    // An erased case is also closed (test entries may still be open), and leaves the review list
    env.DB.prepare(`UPDATE cases SET form_data = '{}', source_page = NULL, follow_up_at = NULL, follow_up_note = NULL,
                      status = ?3, closed_at = COALESCE(closed_at, ?2), retain_until = NULL,
                      purged_at = ?2, updated_at = ?2 WHERE id = ?1`)
      .bind(c.id, now, isOpen(c.status) ? (c.kind === 'enquiry' ? 'closed' : 'cancelled') : c.status),
    // Notes and messages can contain personal details
    env.DB.prepare('UPDATE case_events SET note = NULL WHERE case_id = ?1').bind(c.id),
    // A consultation booking linked to the case holds the same personal details
    env.DB.prepare("UPDATE bookings SET full_name = 'Erased client', email = '', phone = NULL, topic = NULL, status = 'cancelled', cancelled_at = COALESCE(cancelled_at, ?2) WHERE case_id = ?1").bind(c.id, now),
    env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'erased', ?2, ?3, ?4)")
      .bind(c.id, `Personal data and ${docs.length} document${docs.length === 1 ? '' : 's'} erased: ${reason}`, actor, now),
    env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, ?2, 'case.erased', 'case', ?3, ?4, ?5)")
      .bind(now, actor, c.id, JSON.stringify({ reference: c.reference, reason, documents: docs.length, clientErased: eraseClient }), ip)
  ];
  if (eraseClient) {
    statements.push(env.DB.prepare(
      "UPDATE clients SET full_name = 'Erased client', email = NULL, phone = NULL, anonymised_at = ?2, updated_at = ?2 WHERE id = ?1"
    ).bind(c.client_id, now));
  }
  await env.DB.batch(statements);
  return docs.length;
}

/** Everything held about a client, for an access request. */
export async function exportClient(env, clientId) {
  const client = await env.DB.prepare('SELECT id, full_name, email, phone, created_at, updated_at, anonymised_at FROM clients WHERE id = ?1').bind(clientId).first();
  if (!client) return null;
  const cases = (await env.DB.prepare(
    `SELECT id, reference, kind, services, status, form_data, consent_accuracy, consent_processing, created_at, updated_at,
            closed_at, retain_until, legal_hold, purged_at FROM cases WHERE client_id = ?1 ORDER BY created_at`
  ).bind(clientId).all()).results || [];

  const out = [];
  for (const c of cases) {
    const [docs, events, bookings] = await env.DB.batch([
      env.DB.prepare('SELECT file_name, size_bytes, uploaded_at, deleted_at FROM documents WHERE case_id = ?1 ORDER BY uploaded_at').bind(c.id),
      env.DB.prepare('SELECT event, from_status, to_status, note, created_at FROM case_events WHERE case_id = ?1 ORDER BY id').bind(c.id),
      env.DB.prepare('SELECT type, slot_start, minutes, mode, status, topic, created_at, cancelled_at FROM bookings WHERE case_id = ?1').bind(c.id)
    ]);
    let formData = {};
    try { formData = JSON.parse(c.form_data || '{}'); } catch (e) { /* keep empty */ }
    out.push({
      reference: c.reference, type: c.kind, services: c.services, status: c.status,
      submitted: c.created_at, lastUpdated: c.updated_at, closed: c.closed_at, keepUntil: c.retain_until,
      erased: c.purged_at, consent: { informationAccurate: !!c.consent_accuracy, processingConsent: !!c.consent_processing },
      submittedDetails: formData, documents: docs.results || [], history: events.results || [],
      consultations: bookings.results || []
    });
  }
  const subscription = client.email
    ? await env.DB.prepare('SELECT status, source, created_at, confirmed_at, unsubscribed_at FROM subscribers WHERE email = ?1').bind(client.email).first()
    : null;
  return {
    exportedAt: new Date().toISOString(),
    controller: 'Awal Global Consults Limited (RC-9282103), info@awalglobal.com.ng',
    client: { name: client.full_name, email: client.email, phone: client.phone, firstContact: client.created_at, erased: client.anonymised_at },
    cases: out,
    newsletter: subscription || null
  };
}

/** Nightly backup of the database to private storage; old backups are removed. */
export async function backupDatabase(env, runDate) {
  const tables = ['clients', 'cases', 'documents', 'case_events', 'data_requests', 'counters', 'job_runs', 'audit_log', 'subscribers', 'bookings'];
  const results = await env.DB.batch(tables.map(t => env.DB.prepare(`SELECT * FROM ${t}`)));
  const dump = { createdAt: new Date().toISOString(), database: 'awal-cases', tables: {} };
  tables.forEach((t, i) => { dump.tables[t] = results[i].results || []; });
  const body = JSON.stringify(dump);
  await env.DOCS.put(`${BACKUP_PREFIX}${runDate}.json`, body, { httpMetadata: { contentType: 'application/json' } });

  // Remove backups older than the keep window
  const cutoff = new Date(Date.now() - BACKUP_KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  const listed = await env.DOCS.list({ prefix: BACKUP_PREFIX });
  const old = (listed.objects || []).filter(o => o.key.slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 10) < cutoff);
  for (const o of old) await env.DOCS.delete(o.key);
  return { bytes: body.length, removed: old.length };
}

export async function listBackups(env) {
  const listed = await env.DOCS.list({ prefix: BACKUP_PREFIX });
  return (listed.objects || [])
    .map(o => ({ key: o.key, date: o.key.slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 10), size: o.size }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function isBackupKey(key) {
  return /^backups\/\d{4}-\d{2}-\d{2}\.json$/.test(key);
}
