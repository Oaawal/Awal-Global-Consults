/**
 * Read-only API for the Awal Filing Assistant browser extension (/admin/api/...).
 *
 * The extension signs in with a connection key made on the dashboard (/admin/extension).
 * Only a SHA-256 hash of each key is stored (app_settings 'extension_keys'), the key is
 * shown once, and each key can be revoked. The API only reads: case list, filing pack,
 * and documents. Every call is written to the audit log.
 */
import { filingPack } from './filing-pack.js';
import { documentContentType } from './cases.js';

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));

export async function listKeys(env) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'extension_keys'").first();
  try { return row ? JSON.parse(row.value) || [] : []; } catch (e) { return []; }
}
async function saveKeys(env, keys) {
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('extension_keys', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify(keys), new Date().toISOString()).run();
}

/** New key for a named browser. Returns the key (shown once) and its record. */
export async function createKey(env, admin, label) {
  const raw = new Uint8Array(24); crypto.getRandomValues(raw);
  const key = 'agcx_' + btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const rec = { id: crypto.randomUUID().slice(0, 8), label: String(label || 'Browser').slice(0, 60), by: admin, created_at: new Date().toISOString(), last_used: null, hash: await sha256(key) };
  const keys = (await listKeys(env)).slice(-9); // at most 10
  keys.push(rec);
  await saveKeys(env, keys);
  return { key, rec };
}
export async function revokeKey(env, id) {
  const keys = await listKeys(env);
  const left = keys.filter(k => k.id !== id);
  if (left.length !== keys.length) await saveKeys(env, left);
  return left.length !== keys.length;
}

/** The key record for a request's "Authorization: Bearer agcx_..." header, or null. */
async function keyFor(env, request) {
  const m = /^Bearer (agcx_[A-Za-z0-9_-]{20,64})$/.exec(request.headers.get('Authorization') || '');
  if (!m) return null;
  const h = await sha256(m[1]);
  const keys = await listKeys(env);
  const rec = keys.find(k => k.hash === h);
  if (!rec) return null;
  // Note when it was last used (at most once an hour, so reads stay cheap)
  if (!rec.last_used || Date.now() - new Date(rec.last_used) > 3600000) { rec.last_used = new Date().toISOString(); await saveKeys(env, keys); }
  return rec;
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

/** Handles /admin/api/<parts...>; returns a Response, or null when the path is not an API path. */
export async function handleExtensionApi(env, request, parts, audit) {
  if (parts[0] !== 'api') return null;
  if (request.method !== 'GET') return json({ error: 'Read only' }, 405);
  const rec = await keyFor(env, request);
  if (!rec) return json({ error: 'This browser is not connected. Make a new connection key on the dashboard (Filing assistant page).' }, 401);
  const actor = `extension:${rec.by}:${rec.label}`;
  const url = new URL(request.url);

  if (parts[1] === 'whoami') return json({ label: rec.label, by: rec.by });

  if (parts[1] === 'cases') {
    const q = String(url.searchParams.get('q') || '').trim().slice(0, 60);
    const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
    const rows = (await env.DB.prepare(
      `SELECT c.id, c.reference, c.services, c.status, cl.full_name FROM cases c JOIN clients cl ON cl.id = c.client_id
       WHERE c.kind = 'application' AND c.purged_at IS NULL AND c.status NOT IN ('closed', 'cancelled', 'converted')
       ${q ? "AND (c.reference LIKE ?1 ESCAPE '\\' OR cl.full_name LIKE ?1 ESCAPE '\\' OR c.form_data LIKE ?1 ESCAPE '\\')" : ''}
       ORDER BY c.updated_at DESC LIMIT 30`).bind(...(q ? [like] : [])).all()).results || [];
    return json({ cases: rows.map(r => ({ id: r.id, reference: r.reference, name: r.full_name, services: r.services, status: r.status })) });
  }

  if (parts[1] === 'filing' && /^[0-9a-f-]{36}$/.test(parts[2] || '')) {
    const c = await env.DB.prepare(
      `SELECT c.*, cl.full_name, cl.email, cl.phone FROM cases c JOIN clients cl ON cl.id = c.client_id
       WHERE c.id = ?1 AND c.purged_at IS NULL AND cl.anonymised_at IS NULL`).bind(parts[2]).first();
    if (!c) return json({ error: 'Case not found' }, 404);
    const docs = (await env.DB.prepare('SELECT id, file_name, size_bytes, uploaded_at FROM documents WHERE case_id = ?1 AND deleted_at IS NULL ORDER BY uploaded_at').bind(c.id).all()).results || [];
    await audit(actor, 'extension.filing_viewed', 'case', c.id, { reference: c.reference });
    return json({ id: c.id, ...filingPack(c, docs) });
  }

  if (parts[1] === 'doc' && /^[0-9a-f-]{36}$/.test(parts[2] || '')) {
    const d = await env.DB.prepare(
      `SELECT d.id, d.file_name, d.storage_key, c.reference FROM documents d JOIN cases c ON c.id = d.case_id
       WHERE d.id = ?1 AND d.deleted_at IS NULL AND c.purged_at IS NULL`).bind(parts[2]).first();
    const obj = d ? await env.DOCS.get(d.storage_key) : null;
    if (!obj) return json({ error: 'Document not found' }, 404);
    await audit(actor, 'extension.document_fetched', 'document', d.id, { reference: d.reference, file: d.file_name });
    return new Response(obj.body, { headers: { 'Content-Type': documentContentType(d.file_name), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  return json({ error: 'Not found' }, 404);
}
