/**
 * Cloudflare Turnstile (bot check) verification for form submissions.
 *
 * Needs the Cloudflare Pages environment variable TURNSTILE_SECRET_KEY (with
 * TURNSTILE_SITE_KEY in assets/js/site.js). On the live site a missing key
 * fails closed: submissions are refused (and the admins alerted) rather than
 * let through unchecked. Only local and preview copies run without the check.
 */
const LIVE_HOSTS = new Set(['awalglobal.com.ng', 'www.awalglobal.com.ng']);

export async function verifyTurnstile(env, formData, request) {
  if (!env.TURNSTILE_SECRET_KEY) {
    const live = LIVE_HOSTS.has(new URL(request.url).hostname);
    if (live) console.error('TURNSTILE_SECRET_KEY is missing on the live site: submissions are being refused');
    return !live;
  }

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

const BLOCKED_ALERTS_PER_HOUR = 3;

/**
 * A submission failed the bot check and was rejected. Log it, and email the
 * admins the contact details the visitor typed so a real client is not lost
 * silently. The submission itself is NOT saved and no files are kept.
 * Alerts are limited per IP address so a bot cannot flood the inbox.
 */
export async function reportBlockedSubmission(env, request, formName, details, sendEmail) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!env.DB) return;
  try {
    const since = new Date(Date.now() - 3600000).toISOString();
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'submission.blocked' AND ip = ?1 AND at > ?2").bind(ip, since).first();
    await env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, 'visitor', 'submission.blocked', 'form', ?2, NULL, ?3)")
      .bind(new Date().toISOString(), formName, ip).run();
    if (row && row.n >= BLOCKED_ALERTS_PER_HOUR) return;
    const clean = Object.entries(details).filter(([, v]) => v).map(([k, v]) => [k, String(v).slice(0, 200)]);
    if (!clean.length) return;
    await sendEmail(clean);
  } catch (err) {
    console.error('reportBlockedSubmission:', err && err.message);
  }
}
