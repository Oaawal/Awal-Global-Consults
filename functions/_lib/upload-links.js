/**
 * Private document upload links for clients: /upload/<caseId>/<signature>.
 * The signature is an HMAC of the case ID with a secret kept in app_settings
 * (created on first use), so links can be rebuilt for any email without storing
 * them. A link works only while its case is open; closed, cancelled or erased
 * cases refuse uploads.
 */
const SITE_URL = 'https://awalglobal.com.ng';
const enc = new TextEncoder();

function b64url(bytes) {
  let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function secret(env) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'upload_secret'").first();
  if (row) return row.value;
  const value = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('upload_secret', ?1, ?2) ON CONFLICT(key) DO NOTHING").bind(value, new Date().toISOString()).run();
  return (await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'upload_secret'").first()).value;
}

async function sign(env, caseId) {
  const key = await crypto.subtle.importKey('raw', enc.encode(await secret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`upload:${caseId}`))).slice(0, 32);
}

export async function uploadUrl(env, caseId, origin = SITE_URL) {
  return `${origin}/upload/${caseId}/${await sign(env, caseId)}`;
}

/** True when the signature matches (constant-time compare). */
export async function verifyUploadLink(env, caseId, sig) {
  if (!/^[0-9a-f-]{36}$/.test(caseId || '') || !sig) return false;
  const want = await sign(env, caseId);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
