/**
 * Web Push notifications for the admin app (RFC 8030 / 8291 / 8292), using only WebCrypto.
 *
 * - VAPID keys are created once and kept in the app_settings table (no secret to set up).
 * - Each admin device that turns on notifications is stored in push_subscriptions.
 * - Payloads are encrypted (aes128gcm), so the push service never sees case details;
 *   even so, notifications carry only a reference and a service name, never client data.
 * - Devices that the push service reports as gone (404/410) are removed automatically.
 */

const enc = new TextEncoder();
const VAPID_SUBJECT = 'mailto:info@awalglobal.com.ng';

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64url(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** The VAPID key pair, created on first use. Returns { publicKey (b64url raw), privateJwk }. */
export async function vapidKeys(env) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'vapid'").first();
  if (row) return JSON.parse(row.value);
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const keys = {
    publicKey: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey)
  };
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('vapid', ?1, ?2) ON CONFLICT(key) DO NOTHING")
    .bind(JSON.stringify(keys), new Date().toISOString()).run();
  const saved = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'vapid'").first();
  return JSON.parse(saved.value); // another request may have won the race; use what is stored
}

async function vapidAuth(endpoint, keys) {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT })));
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}

/** Encrypt a payload for one subscription (RFC 8291, aes128gcm). */
export async function encryptPayload(payload, p256dh, authSecret, { salt, localKeys } = {}) {
  const uaPublic = fromB64url(p256dh);
  const auth = fromB64url(authSecret);
  const local = localKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const s = salt || crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(s, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));

  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(s, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

async function sendOne(env, keys, sub, message) {
  const body = await encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, keys),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high'
    },
    body
  });
  if (res.status === 404 || res.status === 410) {
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?1').bind(sub.id).run();
    return 'gone';
  }
  if (res.ok) {
    await env.DB.prepare('UPDATE push_subscriptions SET last_ok_at = ?2 WHERE id = ?1').bind(sub.id, new Date().toISOString()).run();
    return 'ok';
  }
  console.error('push failed', res.status, (await res.text()).slice(0, 200));
  return 'failed';
}

/**
 * Notify every admin device. message: { title, body, url, tag }.
 * Never throws: a failed notification must not break a form submission.
 */
export async function notifyAdmins(env, message, { email = null } = {}) {
  if (!env.DB) return { sent: 0 };
  try {
    const subs = (await (email
      ? env.DB.prepare('SELECT * FROM push_subscriptions WHERE email = ?1').bind(email)
      : env.DB.prepare('SELECT * FROM push_subscriptions')).all()).results || [];
    if (!subs.length) return { sent: 0 };
    const keys = await vapidKeys(env);
    let sent = 0;
    for (const sub of subs) {
      try { if (await sendOne(env, keys, sub, message) === 'ok') sent++; }
      catch (err) { console.error('push error:', err && err.message); }
    }
    return { sent, devices: subs.length };
  } catch (err) {
    console.error('notifyAdmins failed:', err && err.message);
    return { sent: 0 };
  }
}
