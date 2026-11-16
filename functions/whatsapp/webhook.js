/**
 * /whatsapp/webhook : Meta's WhatsApp Cloud API calls this.
 * GET  = Meta checks the webhook once (hub.verify_token must match WHATSAPP_VERIFY_TOKEN).
 * POST = a message or delivery update. Signature checked, 200 returned at once, reply sent in the background.
 */
import { validSignature, incomingMessages, handleMessage, sendText } from '../_lib/wa-bot.js';
import { HUMAN_WHATSAPP } from '../_lib/wa-knowledge.js';
import { dailyJobHealth } from '../_lib/job-health.js';

/** A message we could not handle or send is written to the audit log (Activity page, morning summary). */
async function logFailure(env, m, err, stage) {
  const to = String(m.from || '').replace(/\D/g, '');
  await env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, 'whatsapp', 'whatsapp.send_failed', 'whatsapp', ?2, ?3, NULL)")
    .bind(new Date().toISOString(), to.slice(0, 5) + '…' + to.slice(-3), JSON.stringify({ stage, error: String(err && err.message || err).slice(0, 300) })).run().catch(() => {});
}

const plain = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
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
          await logFailure(env, m, err, 'reply');
          await sendText(env, m.from, `Sorry, I couldn't process that just now. Please try again in a moment, or message a colleague on ${HUMAN_WHATSAPP}.`)
            .catch(err2 => logFailure(env, m, err2, 'apology'));
        }
      }
      await dailyJobHealth(env, { alert: true }).catch(() => {});
    })();
    if (typeof context.waitUntil === 'function') context.waitUntil(work); else await work;
  }
  return plain('OK');
}
