/**
 * Bounce alerts: Brevo calls /hooks/brevo when an email we sent could not be
 * delivered (hard bounce, invalid address, or blocked). We find the client's
 * latest case, add a note to it, and alert the admins by email and phone.
 *
 * The webhook is created in Brevo automatically (from the daily job, or the
 * "Turn on" button on the Records page) using the existing BREVO_API_KEY.
 * Its URL carries a random token kept in app_settings, so only Brevo can post to it.
 * Soft bounces (full mailbox, temporary errors) are retried by Brevo and only logged.
 */

import { adminEmails } from './admin-auth.js';
import { sendBrevoEmail } from './brevo.js';
import { securityAlertEmail } from './email-templates.js';
import { notifyAdmins } from './webpush.js';

const SITE_URL = 'https://awalglobal.com.ng';
const ALERT_EVENTS = { hard_bounce: 'Hard bounce', invalid_email: 'Invalid address', blocked: 'Blocked by the recipient’s server', error: 'Delivery error' };
const LOG_EVENTS = { soft_bounce: 'Soft bounce (Brevo will retry)', spam: 'Marked as spam by the recipient' };

function apiBase(env) { return env.BREVO_API_BASE || 'https://api.brevo.com'; }

export async function bounceSettings(env) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'brevo_webhook'").first();
  return row ? JSON.parse(row.value) : null;
}

/** Create the Brevo webhook once. Returns the stored settings, or throws with a reason. */
export async function ensureBounceWebhook(env, origin = SITE_URL) {
  const existing = await bounceSettings(env);
  if (existing && existing.id) return existing;
  if (!env.BREVO_API_KEY) throw new Error('BREVO_API_KEY is not set');
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch(`${apiBase(env)}/v3/webhooks`, {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      url: `${origin}/hooks/brevo?k=${token}`,
      description: 'Awal website: bounce alerts',
      events: ['hardBounce', 'softBounce', 'invalid', 'blocked', 'spam'],
      type: 'transactional'
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(`Brevo refused the webhook (${res.status}${data.message ? `: ${data.message}` : ''})`);
  const settings = { id: data.id, token, createdAt: new Date().toISOString() };
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('brevo_webhook', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2")
    .bind(JSON.stringify(settings), settings.createdAt).run();
  return settings;
}

/** Handle one Brevo event. Returns what was done (for logging and tests). */
export async function handleBrevoEvent(env, ev) {
  const kind = String(ev.event || '');
  const email = String(ev.email || '').trim().toLowerCase();
  if (!email || !(kind in ALERT_EVENTS || kind in LOG_EVENTS)) return { ignored: true };
  const label = ALERT_EVENTS[kind] || LOG_EVENTS[kind];
  const reason = String(ev.reason || '').slice(0, 300);
  const subject = String(ev.subject || '').slice(0, 200);
  const now = new Date().toISOString();

  // The client's most recent case, if we have one
  const c = await env.DB.prepare(
    `SELECT c.id, c.reference FROM cases c JOIN clients cl ON cl.id = c.client_id
     WHERE lower(cl.email) = ?1 AND cl.anonymised_at IS NULL ORDER BY c.created_at DESC LIMIT 1`
  ).bind(email).first();

  const note = `Email to ${email} failed: ${label}${reason ? ` (${reason})` : ''}${subject ? `. Email: “${subject}”` : ''}. ${kind in ALERT_EVENTS ? 'Call or WhatsApp the client to get a correct address.' : ''}`.trim();
  const stmts = [
    env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, 'system:brevo', 'email.bounced', 'email', ?2, ?3, NULL)")
      .bind(now, c ? c.id : email, JSON.stringify({ event: kind, reason, subject }))
  ];
  if (c) stmts.push(env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'email_bounced', ?2, 'system:brevo', ?3)").bind(c.id, note, now));
  await env.DB.batch(stmts);

  if (!(kind in ALERT_EVENTS)) return { logged: true, caseId: c ? c.id : null };
  // Never email an alert about a bounce to the address that bounced
  const caseUrl = c ? `${SITE_URL}/admin/case/${c.id}` : `${SITE_URL}/admin/clients`;
  const html = securityAlertEmail({
    title: 'A client email bounced',
    intro: c ? `An email to the client on case ${c.reference} could not be delivered.` : 'An email sent from the website could not be delivered.',
    rows: [['Address', email], ['Problem', label], ...(reason ? [['Details', reason]] : []), ...(subject ? [['Email', subject]] : [])],
    action: 'The address is probably wrong or no longer in use. Call or WhatsApp the client to confirm it, then update it in the dashboard.',
    buttonUrl: caseUrl, buttonLabel: c ? 'Open the case' : 'Open clients'
  });
  for (const to of adminEmails(env)) {
    if (to === email) continue;
    try { await sendBrevoEmail(env, { to: { email: to }, subject: `Email bounced${c ? ` [${c.reference}]` : ''}: ${email}`, html }); }
    catch (err) { console.error('bounce alert email failed:', err && err.message); }
  }
  await notifyAdmins(env, {
    title: `Email bounced${c ? ` · ${c.reference}` : ''}`,
    body: `${email}: ${label}. Contact the client by phone.`,
    url: c ? `/admin/case/${c.id}` : '/admin/clients',
    tag: `bounce-${email}`
  });
  return { alerted: true, caseId: c ? c.id : null };
}
