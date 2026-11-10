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

async function sign(env, caseId, purpose = 'upload') {
  const key = await crypto.subtle.importKey('raw', enc.encode(await secret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`${purpose}:${caseId}`))).slice(0, 32);
}

async function matches(env, caseId, sig, purpose) {
  if (!/^[0-9a-f-]{36}$/.test(caseId || '') || !sig) return false;
  const want = await sign(env, caseId, purpose);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/**
 * Private link to the full application form for a case that started as a quick quote
 * request: /kyc/?c=<caseId>&k=<signature>. What the client submits there is added to
 * that case instead of opening a new one.
 */
export async function detailsUrl(env, caseId, origin = SITE_URL) {
  return `${origin}/kyc/?c=${caseId}&k=${await sign(env, caseId, 'details')}`;
}
export const verifyDetailsLink = (env, caseId, sig) => matches(env, caseId, sig, 'details');

export async function uploadUrl(env, caseId, origin = SITE_URL) {
  return `${origin}/upload/${caseId}/${await sign(env, caseId)}`;
}

/** True when the signature matches (constant-time compare). */
export async function verifyUploadLink(env, caseId, sig) {
  return matches(env, caseId, sig, 'upload');
}
