/**
 * /whatsapp/webhook : Meta's WhatsApp Cloud API calls this.
 * GET  = Meta checks the webhook once (hub.verify_token must match WHATSAPP_VERIFY_TOKEN).
 * POST = a message or delivery update. Signature checked, 200 returned at once, reply sent in the background.
 */
import { validSignature, incomingMessages, handleMessage, sendText } from '../_lib/wa-bot.js';
import { HUMAN_WHATSAPP } from '../_lib/wa-knowledge.js';

const plain = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  // Set-up check: says which settings exist (never their values). Remove once connected.
  if (u.searchParams.get('setup') === 'check') return plain(JSON.stringify({
    token: !!env.WHATSAPP_TOKEN, app_secret: !!env.WHATSAPP_APP_SECRET, verify_token: !!env.WHATSAPP_VERIFY_TOKEN,
    verify_length: (env.WHATSAPP_VERIFY_TOKEN || '').length, ai: !!env.ANTHROPIC_API_KEY, storage: !!env.DOCS
  }));
  if (u.searchParams.get('hub.mode') === 'subscribe' && env.WHATSAPP_VERIFY_TOKEN && u.searchParams.get('hub.verify_token') === env.WHATSAPP_VERIFY_TOKEN) {
    return plain(u.searchParams.get('hub.challenge') || '');
  }
  return plain('Forbidden', 403);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const raw = await request.text();
  if (!(await validSignature(env, raw, request.headers.get('X-Hub-Signature-256')))) return plain('Bad signature', 401);
  let payload;
  try { payload = JSON.parse(raw); } catch (e) { return plain('Bad JSON', 400); }
  const messages = incomingMessages(payload);
  if (messages.length && env.DOCS && env.WHATSAPP_TOKEN) {
    const work = (async () => {
      for (const m of messages) {
        try { await handleMessage(env, request, m); }
        catch (err) {
          console.error('whatsapp: message failed:', err && err.message);
          // Never leave a client unanswered: a plain apology with the human number
          await sendText(env, m.from, `Sorry, I couldn't process that just now. Please try again in a moment, or message a colleague on ${HUMAN_WHATSAPP}.`).catch(() => {});
        }
      }
    })();
    if (typeof context.waitUntil === 'function') context.waitUntil(work); else await work;
  }
  return plain('OK');
}
