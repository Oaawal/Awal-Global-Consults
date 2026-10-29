/**
 * Client records: saves every form submission to the D1 database (binding DB)
 * and its documents to the private R2 bucket awal-documents (binding DOCS). Tables and retention rules
 * are described in db/schema.sql.
 *
 * Records switch on once both bindings are added to the Pages project
 * (Settings → Bindings). Until then recordsEnabled() is false and the forms
 * keep working by email only, exactly as before.
 */

const SYSTEM_ACTOR = 'system:website-form';
const ENQUIRY_RETENTION_MONTHS = 12;

export function recordsEnabled(env) {
  return !!(env && env.DB && env.DOCS);
}

function addMonths(iso, months) {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

/** Next yearly case reference, e.g. AGC-2026-0007. */
async function nextReference(env, prefix) {
  const name = `${prefix}-${new Date().getUTCFullYear()}`;
  const row = await env.DB
    .prepare('INSERT INTO counters (name, value) VALUES (?1, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value')
    .bind(name)
    .first();
  return `${name}-${String(row.value).padStart(4, '0')}`;
}

/**
 * Save one submission as a client + case, with its documents.
 * The database writes run as a single batch, so a case is either saved
 * completely or not at all; if they fail, any stored files are removed again.
 *
 * @param {object} env - Pages env bindings (DB, DOCS)
 * @param {Request} request
 * @param {object} s
 * @param {'application'|'enquiry'} s.kind
 * @param {string} s.fullName
 * @param {string} [s.email]
 * @param {string} [s.phone]
 * @param {string[]} [s.services]
 * @param {object} s.fields - submitted form fields, saved as JSON
 * @param {boolean} [s.consentAccuracy]
 * @param {boolean} [s.consentProcessing]
 * @param {Array<{name:string, type:string, bytes:Uint8Array}>} [s.files]
 * @returns {Promise<{reference:string, caseId:string}>}
 */
export async function recordSubmission(env, request, s) {
  const now = new Date().toISOString();
  const kind = s.kind;
  const email = s.email ? s.email.trim().toLowerCase() : null;
  const phone = s.phone ? String(s.phone).trim() : null;
  const services = (s.services || []).join(', ');
  const ip = request.headers.get('CF-Connecting-IP');
  const sourcePage = request.headers.get('Referer');

  const reference = await nextReference(env, kind === 'application' ? 'AGC' : 'ENQ');
  const caseId = crypto.randomUUID();

  // Returning clients are matched by email address
  const existing = email
    ? await env.DB.prepare('SELECT id FROM clients WHERE email = ?1 AND anonymised_at IS NULL LIMIT 1').bind(email).first()
    : null;
  const clientId = existing ? existing.id : crypto.randomUUID();

  const storedKeys = [];
  const statements = [];
  try {
    statements.push(existing
      ? env.DB.prepare('UPDATE clients SET full_name = ?2, phone = COALESCE(?3, phone), updated_at = ?4 WHERE id = ?1')
          .bind(clientId, s.fullName, phone, now)
      : env.DB.prepare('INSERT INTO clients (id, full_name, email, phone, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)')
          .bind(clientId, s.fullName, email, phone, now));

    statements.push(env.DB.prepare(
      `INSERT INTO cases (id, reference, client_id, kind, services, status, form_data, consent_accuracy, consent_processing,
                          source_page, created_at, updated_at, status_changed_at, retention_class, retain_until)
       VALUES (?1, ?2, ?3, ?4, ?5, 'new', ?6, ?7, ?8, ?9, ?10, ?10, ?10, ?4, ?11)`
    ).bind(
      caseId, reference, clientId, kind, services, JSON.stringify(s.fields || {}),
      s.consentAccuracy ? 1 : 0, s.consentProcessing ? 1 : 0, sourcePage, now,
      // Applications get their retention date when the case closes; enquiries expire 12 months after last activity
      kind === 'enquiry' ? addMonths(now, ENQUIRY_RETENTION_MONTHS) : null
    ));

    for (const file of s.files || []) {
      const docId = crypto.randomUUID();
      const key = `case/${caseId}/${docId}`;
      await env.DOCS.put(key, file.bytes, {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
        customMetadata: { caseId, docId, fileName: file.name }
      });
      storedKeys.push(key);
      statements.push(env.DB.prepare(
        'INSERT INTO documents (id, case_id, file_name, content_type, size_bytes, storage_key, uploaded_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
      ).bind(docId, caseId, file.name, file.type || null, file.bytes.byteLength, key, now));
    }

    statements.push(env.DB.prepare(
      "INSERT INTO case_events (case_id, event, to_status, note, actor, created_at) VALUES (?1, 'created', 'new', ?2, ?3, ?4)"
    ).bind(caseId, `Submitted via website (${kind})`, SYSTEM_ACTOR, now));

    statements.push(env.DB.prepare(
      "INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, ?2, 'case.created', 'case', ?3, ?4, ?5)"
    ).bind(now, SYSTEM_ACTOR, caseId, JSON.stringify({ reference, kind, documents: storedKeys.length, newClient: !existing }), ip));

    await env.DB.batch(statements);
  } catch (err) {
    // Never leave documents in storage without a database record pointing at them
    await Promise.all(storedKeys.map(k => env.DOCS.delete(k).catch(() => {})));
    throw err;
  }

  return { reference, caseId };
}
