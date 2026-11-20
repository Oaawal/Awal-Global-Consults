/**
 * Authenticator app sign-in (TOTP, RFC 6238: Google Authenticator, Microsoft Authenticator, Authy...).
 *
 * Each admin can link an authenticator app and then sign in with its 6-digit code instead of an
 * emailed code, for example on a new phone when the mailbox is not reachable. Ten one-time
 * recovery codes are issued at set-up in case the phone is lost.
 *
 * Stored per admin in app_settings ('totp:<email>'): the secret encrypted with AES-GCM under a key
 * derived from the TOTP_KEY secret (or CRON_SECRET), so a copy of the database alone cannot
 * produce codes; recovery codes only as SHA-256 hashes; the last time-step used, so a code works once.
 */
import qrcode from './vendor/qrcode/qrcode.js';

const ISSUER = 'Awal Global';
const STEP = 30, DIGITS = 6, WINDOW = 1;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const b32encode = bytes => { let bits = 0, val = 0, out = ''; for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; };
const b32decode = s => { const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, ''); let bits = 0, val = 0; const out = []; for (const c of clean) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); };
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async t => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function hotp(secretBytes, counter) {
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8); const dv = new DataView(msg);
  dv.setUint32(0, Math.floor(counter / 0x100000000)); dv.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** DIGITS).padStart(DIGITS, '0');
}
/** For tests and the set-up check: the code for a base32 secret at a time. */
export async function totpCode(secretB32, now = Date.now()) { return hotp(b32decode(secretB32), Math.floor(now / 1000 / STEP)); }

async function aesKey(env) {
  const base = env.TOTP_KEY || env.CRON_SECRET;
  if (!base) return null;
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`awal-totp:${base}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, text) {
  const key = await aesKey(env); if (!key) throw new Error('No TOTP_KEY or CRON_SECRET set');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64(iv), data: b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)))) };
}
async function unseal(env, box) {
  const key = await aesKey(env); if (!key || !box) return null;
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data))); } catch (e) { return null; }
}

const settingKey = email => `totp:${String(email).toLowerCase()}`;
async function getSetting(env, k) { const r = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?1').bind(k).first(); return r ? JSON.parse(r.value) : null; }
async function putSetting(env, k, v) {
  await env.DB.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3').bind(k, JSON.stringify(v), new Date().toISOString()).run();
}

/** { enabled, enabledAt, recoveryLeft } for the settings page. */
export async function totpStatus(env, email) {
  const s = await getSetting(env, settingKey(email));
  return s && s.enabledAt ? { enabled: true, enabledAt: s.enabledAt, recoveryLeft: (s.recovery || []).filter(Boolean).length } : { enabled: false };
}

/** Start set-up: a new secret (kept pending until confirmed with a code). Returns what the page shows. */
export async function startTotpSetup(env, email) {
  const secret = b32encode(crypto.getRandomValues(new Uint8Array(20)));
  const s = (await getSetting(env, settingKey(email))) || {};
  s.pending = await seal(env, secret); s.pendingAt = new Date().toISOString();
  await putSetting(env, settingKey(email), s);
  return setupView(email, secret);
}
export async function pendingSetup(env, email) {
  const s = await getSetting(env, settingKey(email));
  if (!s || !s.pending || Date.now() - Date.parse(s.pendingAt) > 30 * 60000) return null;
  const secret = await unseal(env, s.pending);
  return secret ? setupView(email, secret) : null;
}
function setupView(email, secret) {
  const uri = `otpauth://totp/${encodeURIComponent(`${ISSUER}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
  const q = qrcode(0, 'M'); q.addData(uri); q.make();
  return { uri, secretGrouped: secret.match(/.{1,4}/g).join(' '), qrSvg: q.createSvgTag({ cellSize: 5, margin: 3, scalable: true }) };
}

/** Confirm set-up with a code from the app. Returns the 10 recovery codes (shown once) or null. */
export async function confirmTotpSetup(env, email, code) {
  const s = await getSetting(env, settingKey(email));
  const secret = s && s.pending ? await unseal(env, s.pending) : null;
  if (!secret) return null;
  const step = await matchStep(secret, code);
  if (step === null) return null;
  const recovery = Array.from({ length: 10 }, () => { const b = crypto.getRandomValues(new Uint8Array(5)); return b32encode(b).slice(0, 8).toLowerCase().replace(/(.{4})/, '$1-'); });
  const next = { secret: s.pending, enabledAt: new Date().toISOString(), lastStep: step, recovery: await Promise.all(recovery.map(r => sha256(`${email}:${r}`))) };
  await putSetting(env, settingKey(email), next);
  return recovery;
}

export async function disableTotp(env, email) {
  await env.DB.prepare('DELETE FROM app_settings WHERE key = ?1').bind(settingKey(email)).run();
}

async function matchStep(secret, code) {
  code = String(code || '').replace(/\D/g, '');
  if (code.length !== DIGITS) return null;
  const now = Math.floor(Date.now() / 1000 / STEP), bytes = b32decode(secret);
  for (let d = -WINDOW; d <= WINDOW; d++) if (await hotp(bytes, now + d) === code) return now + d;
  return null;
}

/**
 * Check a sign-in code from the app (6 digits) or a recovery code (xxxx-xxxx).
 * Returns 'totp', 'recovery' or null. Each code works once.
 */
export async function verifyTotpLogin(env, email, input) {
  const s = await getSetting(env, settingKey(email));
  if (!s || !s.enabledAt) return null;
  const raw = String(input || '').trim().toLowerCase();
  if (/^[a-z2-7]{4}-?[a-z2-7]{4}$/.test(raw)) {
    const h = await sha256(`${email}:${raw.replace(/^(.{4})-?/, '$1-')}`);
    const i = (s.recovery || []).indexOf(h);
    if (i < 0) return null;
    s.recovery[i] = null; await putSetting(env, settingKey(email), s);
    return 'recovery';
  }
  const secret = await unseal(env, s.secret);
  if (!secret) return null;
  const step = await matchStep(secret, raw);
  if (step === null || step <= (s.lastStep || 0)) return null;
  s.lastStep = step; await putSetting(env, settingKey(email), s);
  return 'totp';
}
