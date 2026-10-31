/** GET /book-cancel?t=… shows the booking; POST cancels it (a link alone never cancels, so mail scanners can't). */
import { publicPage } from './_lib/public-page.js';
import { esc } from './_lib/admin-views.js';
import { CONSULT_TYPES, fmtLagos } from './_lib/booking.js';
import { sendBrevoEmail } from './_lib/brevo.js';
import { adminEmails } from './_lib/admin-auth.js';

async function load(env, token) {
  return env.DB && token ? env.DB.prepare('SELECT * FROM bookings WHERE token = ?1').bind(token).first() : null;
}
const notFound = () => publicPage({ title: 'Booking not found', heading: 'We couldn’t find that booking', body: '<p>The link may be incomplete. Reply to your confirmation email or message us on WhatsApp and we’ll help.</p>', actions: [{ href: '/book', label: 'Book a consultation' }] }, 404);

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('t') || '';
  const b = await load(env, token);
  if (!b) return notFound();
  const when = fmtLagos(b.slot_start);
  if (b.status === 'cancelled') {
    return publicPage({ title: 'Booking cancelled', heading: 'This booking is cancelled', body: `<p>Your consultation on <strong>${esc(when)}</strong> was cancelled.</p>`, actions: [{ href: '/book', label: 'Book another time' }] });
  }
  if (new Date(b.slot_start) < new Date()) {
    return publicPage({ title: 'Booking', heading: 'This consultation has passed', body: `<p>Your consultation was on ${esc(when)}.</p>`, actions: [{ href: '/book', label: 'Book another consultation' }] });
  }
  const t = CONSULT_TYPES[b.type];
  return publicPage({
    title: 'Cancel booking', heading: 'Cancel your consultation?',
    body: `<p><strong>${esc(t ? t.label : b.type)}</strong><br>${esc(when)} (Lagos time)</p>
      <form method="post"><input type="hidden" name="t" value="${esc(token)}">
      <button type="submit" style="background:#b42318;color:#fff;border:0;border-radius:999px;padding:11px 18px;font-weight:700;font-size:15px;cursor:pointer">Yes, cancel this booking</button></form>`,
    actions: [{ href: '/', label: 'Keep my booking' }]
  });
}

export async function onRequestPost({ request, env }) {
  let token = '';
  try { token = String((await request.formData()).get('t') || ''); } catch { /* fall through */ }
  const b = await load(env, token);
  if (!b) return notFound();
  const when = fmtLagos(b.slot_start);
  if (b.status !== 'cancelled') {
    const now = new Date().toISOString();
    const stmts = [
      env.DB.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ?2 WHERE id = ?1").bind(b.id, now),
      env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, 'system:booking', 'booking.cancelled', 'booking', ?2, ?3, ?4)")
        .bind(now, b.id, JSON.stringify({ when: b.slot_start }), request.headers.get('CF-Connecting-IP'))
    ];
    if (b.case_id) stmts.push(env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'note', ?2, 'system:booking', ?3)")
      .bind(b.case_id, `Client cancelled the consultation booked for ${when}`, now));
    await env.DB.batch(stmts);
    for (const to of adminEmails(env)) {
      try {
        await sendBrevoEmail(env, { to: { email: to }, subject: `Booking cancelled: ${b.full_name}, ${when}`, html: `<p>${esc(b.full_name)} (${esc(b.email)}) cancelled their consultation on ${esc(when)}.</p>` });
      } catch (err) { console.error('cancel: admin email failed:', err && err.message); }
    }
  }
  return publicPage({ title: 'Booking cancelled', heading: 'Your booking is cancelled', body: `<p>Your consultation on <strong>${esc(when)}</strong> has been cancelled. The time is free for someone else.</p>`, actions: [{ href: '/book', label: 'Book another time' }] });
}
