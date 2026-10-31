/**
 * POST /subscribe: newsletter sign-up with double opt-in.
 * Saves the address as "pending" and emails a confirmation link; nothing is
 * sent to the address again until the link is opened.
 */
import { sendBrevoEmail } from './_lib/brevo.js';
import { subscribeConfirmEmail } from './_lib/email-templates.js';
import { randomToken } from './_lib/booking.js';
import { SITE_URL } from './_lib/cases.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PER_IP_PER_HOUR = 5;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Sign-up is not available right now. Please try again later.' }, 503);
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'Invalid request' }, 400); }

  // Honeypot: real visitors never fill this field
  if (String(form.get('company_website') || '').trim()) return json({ ok: true });

  const email = String(form.get('email') || '').trim().toLowerCase().slice(0, 200);
  if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email address.' }, 400);
  if (form.get('consent') !== 'yes') return json({ error: 'Please tick the box to agree to receive updates.' }, 400);

  const ip = request.headers.get('CF-Connecting-IP');
  const now = new Date().toISOString();
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'subscriber.signup' AND ip = ?1 AND at >= ?2"
  ).bind(ip, hourAgo).first();
  if (recent && recent.n >= MAX_PER_IP_PER_HOUR) return json({ error: 'Too many sign-ups from this connection. Please try again later.' }, 429);

  const existing = await env.DB.prepare('SELECT id, status, token FROM subscribers WHERE email = ?1').bind(email).first();
  if (existing && existing.status === 'confirmed') return json({ ok: true, already: true });

  const token = existing ? existing.token : randomToken();
  const id = existing ? existing.id : crypto.randomUUID();
  const source = String(form.get('source') || request.headers.get('Referer') || '').slice(0, 300);
  await env.DB.batch([
    existing
      ? env.DB.prepare("UPDATE subscribers SET status = 'pending', unsubscribed_at = NULL, source = ?2 WHERE id = ?1").bind(id, source)
      : env.DB.prepare("INSERT INTO subscribers (id, email, status, token, source, created_at) VALUES (?1, ?2, 'pending', ?3, ?4, ?5)")
          .bind(id, email, token, source, now),
    env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, 'system:newsletter', 'subscriber.signup', 'subscriber', ?2, ?3, ?4)")
      .bind(now, id, JSON.stringify({ source }), ip)
  ]);

  try {
    await sendBrevoEmail(env, {
      to: { email },
      subject: 'Confirm your Awal Guides updates',
      html: subscribeConfirmEmail({ confirmUrl: `${SITE_URL}/subscribe-confirm?t=${encodeURIComponent(token)}` })
    });
  } catch (err) {
    console.error('subscribe: confirmation email failed:', err && err.message);
    return json({ error: 'We couldn’t send the confirmation email. Please try again shortly.' }, 502);
  }
  return json({ ok: true });
}
