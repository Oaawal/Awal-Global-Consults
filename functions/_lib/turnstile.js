/**
 * Cloudflare Turnstile (bot check) verification for form submissions.
 *
 * Off by default: if the Cloudflare Pages environment variable
 * TURNSTILE_SECRET_KEY is not set, every submission passes. To switch it on,
 * set TURNSTILE_SECRET_KEY in Cloudflare Pages AND fill in TURNSTILE_SITE_KEY
 * in assets/js/site.js — always both together.
 */
export async function verifyTurnstile(env, formData, request) {
  if (!env.TURNSTILE_SECRET_KEY) return true;

  const token = String(formData.get('cf-turnstile-response') || '');
  if (!token) return false;

  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) body.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('Turnstile verification failed:', err && err.message);
    return false;
  }
}
