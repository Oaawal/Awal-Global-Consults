/** POST /hooks/brevo?k=TOKEN : delivery events from Brevo (bounces). See _lib/bounces.js. */
import { bounceSettings, handleBrevoEvent } from '../_lib/bounces.js';

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
  const settings = await bounceSettings(env);
  const given = new URL(request.url).searchParams.get('k') || '';
  if (!settings || !given || !(await sameToken(given, settings.token))) return new Response('Forbidden', { status: 403 });
  let body;
  try { body = await request.json(); } catch (e) { return new Response('Bad request', { status: 400 }); }
  const events = Array.isArray(body) ? body.slice(0, 50) : [body];
  for (const ev of events) {
    try { await handleBrevoEvent(env, ev); } catch (err) { console.error('brevo hook:', err && err.message); }
  }
  return new Response('ok');
}
