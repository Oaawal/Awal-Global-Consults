/**
 * POST /cron/daily — runs the daily job (see _lib/automation.js).
 * Called at 8am Lagos time by the small "awal-daily" Cloudflare Worker, which
 * sends the shared CRON_SECRET. Running it again on the same day does nothing.
 */
import { runDailyJob } from '../_lib/automation.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function sameSecret(a, b) {
  // Compare hashes so the check takes the same time however much of the secret matches
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.CRON_SECRET || !env.DB) return json({ error: 'Daily job is not configured' }, 503);

  const auth = request.headers.get('Authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!given || !(await sameSecret(given, env.CRON_SECRET))) return json({ error: 'Unauthorized' }, 401);

  try {
    return json(await runDailyJob(env, request));
  } catch (err) {
    console.error('daily job failed:', err && err.message);
    return json({ error: 'Daily job failed' }, 500);
  }
}
