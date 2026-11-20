/**
 * POST /cron/mail-in — called by the awal-mail Worker (ops/mail-worker.js) right after it stores a
 * new email. Reads it, runs the security checks and notifies admin phones. Uses CRON_SECRET.
 * If this call never arrives, the dashboard reads the email the first time it is opened.
 */
import { readIncoming } from '../_lib/mail.js';
import { notifyAdmins } from '../_lib/webpush.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.CRON_SECRET || !env.DB || !env.DOCS) return json({ error: 'Not configured' }, 503);
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ') || !(await sameSecret(auth.slice(7), env.CRON_SECRET))) return json({ error: 'Unauthorized' }, 401);
  const { id } = await request.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/.test(String(id || ''))) return json({ error: 'Bad id' }, 400);
  const row = await env.DB.prepare("SELECT * FROM mail_messages WHERE id = ?1 AND direction = 'in'").bind(id).first();
  if (!row) return json({ error: 'Not found' }, 404);
  try { await readIncoming(env, row); } catch (err) { console.error('mail-in: could not read', id, err && err.message); }
  let warnings = []; try { warnings = JSON.parse(row.warnings || '[]'); } catch (e) {}
  const who = row.from_name || row.from_addr;
  const flag = warnings.some(w => w.level === 'danger') ? '⚠ ' : '';
  const push = notifyAdmins(env, { title: `${flag}Email from ${who}`.slice(0, 80), body: String(row.subject || '(no subject)').slice(0, 120),
    url: `${new URL(request.url).origin}/admin/mail/${id}`, tag: `mail-${id}` });
  if (typeof waitUntil === 'function') waitUntil(push); else await push;
  return json({ ok: true, warnings: warnings.length });
}
