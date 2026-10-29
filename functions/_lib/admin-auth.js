/**
 * Admin dashboard sign-in: a 6-digit code is emailed to an authorised address,
 * and a correct code starts a session held in a secure cookie.
 *
 * Authorised addresses come from the ADMIN_EMAILS environment variable
 * (comma-separated) and default to info@awalglobal.com.ng. Codes and session
 * tokens are stored only as SHA-256 hashes.
 */

const DEFAULT_ADMIN_EMAILS = ['info@awalglobal.com.ng'];
const CODE_TTL_MINUTES = 10;
const CODE_MAX_ATTEMPTS = 5;
const CODES_PER_HOUR = 5;
const SESSION_DAYS = 7;
export const SESSION_COOKIE = '__Host-agc_admin';

export function adminEmails(env) {
  const list = String(env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : DEFAULT_ADMIN_EMAILS;
}

export function isAdminEmail(env, email) {
  return adminEmails(env).includes(String(email || '').trim().toLowerCase());
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(bytes = 32) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomCode() {
  // Rejection sampling keeps every 6-digit code equally likely
  const arr = new Uint32Array(1);
  do { crypto.getRandomValues(arr); } while (arr[0] >= 4294000000);
  return String(arr[0] % 1000000).padStart(6, '0');
}

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60000).toISOString();
}

/**
 * Create a login code for an authorised email. Returns the plain code to email,
 * or null when the address is not authorised or has asked for too many codes.
 */
export async function createLoginCode(env, email) {
  email = String(email || '').trim().toLowerCase();
  if (!isAdminEmail(env, email)) return null;

  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const recent = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM admin_login_codes WHERE email = ?1 AND created_at > ?2')
    .bind(email, hourAgo).first();
  if (recent && recent.n >= CODES_PER_HOUR) return null;

  const id = crypto.randomUUID();
  const code = randomCode();
  await env.DB
    .prepare('INSERT INTO admin_login_codes (id, email, code_hash, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(id, email, await sha256Hex(`${id}:${code}`), new Date().toISOString(), minutesFromNow(CODE_TTL_MINUTES))
    .run();
  return code;
}

/** Check a code against the newest unused one for this email. Returns true if it matches. */
export async function verifyLoginCode(env, email, code) {
  email = String(email || '').trim().toLowerCase();
  code = String(code || '').replace(/\D/g, '');
  if (!isAdminEmail(env, email) || code.length !== 6) return false;

  const row = await env.DB
    .prepare('SELECT id, code_hash, attempts FROM admin_login_codes WHERE email = ?1 AND used_at IS NULL AND expires_at > ?2 ORDER BY created_at DESC LIMIT 1')
    .bind(email, new Date().toISOString()).first();
  if (!row || row.attempts >= CODE_MAX_ATTEMPTS) return false;

  if (await sha256Hex(`${row.id}:${code}`) !== row.code_hash) {
    await env.DB.prepare('UPDATE admin_login_codes SET attempts = attempts + 1 WHERE id = ?1').bind(row.id).run();
    return false;
  }
  await env.DB.prepare('UPDATE admin_login_codes SET used_at = ?2 WHERE id = ?1').bind(row.id, new Date().toISOString()).run();
  return true;
}

/** Start a session; returns the Set-Cookie header value. */
export async function createSession(env, request, email) {
  const token = randomToken();
  const now = new Date().toISOString();
  await env.DB
    .prepare('INSERT INTO admin_sessions (token_hash, email, created_at, expires_at, ip, user_agent) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(await sha256Hex(token), email.toLowerCase(), now, minutesFromNow(SESSION_DAYS * 24 * 60),
      request.headers.get('CF-Connecting-IP'), (request.headers.get('User-Agent') || '').slice(0, 200))
    .run();
  return `${SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** The signed-in admin's email, or null. Sessions for addresses no longer authorised are ignored. */
export async function currentAdmin(env, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB
    .prepare('SELECT email FROM admin_sessions WHERE token_hash = ?1 AND expires_at > ?2')
    .bind(await sha256Hex(token), new Date().toISOString()).first();
  return row && isAdminEmail(env, row.email) ? row.email : null;
}

/** End the current session; returns the Set-Cookie header value that clears it. */
export async function endSession(env, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?1').bind(await sha256Hex(token)).run();
  }
  return `${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}
