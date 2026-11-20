/**
 * POST /hooks/brevo?k=TOKEN : events from Brevo. Bounces (see _lib/bounces.js) and, for emails sent
 * from the dashboard mailbox, delivered and opened (the ticks; see _lib/mail.js). Each webhook has its own token.
 */
import { bounceSettings, handleBrevoEvent } from '../_lib/bounces.js';
import { mailWebhookSettings, handleMailEvent, RECEIPT_EVENTS } from '../_lib/mail.js';

async function sameToken(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const ua = new Uint8Array(x), ub = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return new Response('Not configured', { status: 503 });
  const given = new URL(request.url).searchParams.get('k') || '';
  const settings = await bounceSettings(env);
  const mailHook = await mailWebhookSettings(env).catch(() => null);
  const ok = given && ((settings && await sameToken(given, settings.token)) || (mailHook && await sameToken(given, mailHook.token)));
  if (!ok) return new Response('Forbidden', { status: 403 });
  let body;
  try { body = await request.json(); } catch (e) { return new Response('Bad request', { status: 400 }); }
  const events = Array.isArray(body) ? body.slice(0, 50) : [body];
  for (const ev of events) {
    try { if (RECEIPT_EVENTS.includes(String(ev && ev.event))) await handleMailEvent(env, ev); else await handleBrevoEvent(env, ev); }
    catch (err) { console.error('brevo hook:', err && err.message); }
  }
  return new Response('ok');
}
