/**
 * POST /book-consultation: books a consultation slot.
 * Saves the booking, records it as an enquiry in the client records (so it
 * shows in the dashboard), and emails the client and the office.
 */
import { verifyTurnstile } from './_lib/turnstile.js';
import { sendBrevoEmail } from './_lib/brevo.js';
import { bookingClientEmail, bookingAdminEmail } from './_lib/email-templates.js';
import { recordsEnabled, recordSubmission } from './_lib/records.js';
import { adminEmails } from './_lib/admin-auth.js';
import { SITE_URL } from './_lib/cases.js';
import { CONSULT_TYPES, MODES, PAYMENT_BANK, availableSlots, takenSlots, fmtLagos, feeText, randomToken } from './_lib/booking.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
const field = (form, k, max = 300) => String(form.get(k) || '').trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Booking is not available right now. Please contact us on WhatsApp.' }, 503);
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'Invalid request' }, 400); }
  if (field(form, 'company_website')) return json({ ok: true });
  if (!(await verifyTurnstile(env, form, request))) {
    return json({ error: 'Security check failed. Please refresh the page and try again.' }, 400);
  }

  const type = field(form, 'type', 40);
  const slot = field(form, 'slot', 40);
  const mode = field(form, 'mode', 20);
  const fullName = field(form, 'full_name', 120);
  const email = field(form, 'email', 200).toLowerCase();
  const phone = field(form, 'phone', 40);
  const topic = field(form, 'topic', 1000);
  const t = CONSULT_TYPES[type];

  if (!t) return json({ error: 'Please choose a consultation type.' }, 400);
  if (!MODES[mode]) return json({ error: 'Please choose how you’d like to talk.' }, 400);
  if (!fullName || !phone) return json({ error: 'Please enter your name and phone number.' }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email address.' }, 400);
  if (form.get('consent') !== 'yes') return json({ error: 'Please tick the box to agree to how we use your details.' }, 400);

  // The slot must still be free (someone may have taken it since the page loaded)
  const taken = await takenSlots(env);
  const free = Object.values(availableSlots(type, taken)).flat();
  if (!free.includes(slot)) return json({ error: 'Sorry, that time has just been taken. Please pick another.', refresh: true }, 409);

  const id = crypto.randomUUID();
  const token = randomToken();
  const now = new Date().toISOString();
  const status = t.paid ? 'awaiting_payment' : 'confirmed';
  try {
    await env.DB.prepare(
      `INSERT INTO bookings (id, type, slot_start, minutes, mode, status, full_name, email, phone, topic, token, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
    ).bind(id, type, slot, t.minutes, mode, status, fullName, email, phone, topic || null, token, now).run();
  } catch (err) {
    // Unique slot index: two people booked the same time at once
    return json({ error: 'Sorry, that time has just been taken. Please pick another.', refresh: true }, 409);
  }
  const whenText = fmtLagos(slot);
  const details = { typeLabel: t.label, whenText, modeLabel: MODES[mode], feeText: feeText(type), topic };

  // Save as an enquiry in the client records so it appears in the dashboard
  let reference = null, caseId = null;
  if (recordsEnabled(env)) {
    try {
      ({ reference, caseId } = await recordSubmission(env, request, {
        kind: 'enquiry', fullName, email, phone,
        services: [`Consultation: ${t.short}`],
        fields: { 'Consultation': t.label, 'When (Lagos time)': whenText, 'How': MODES[mode], 'Fee': feeText(type), 'Topic': topic || '(not given)' },
        consentProcessing: true
      }));
      await env.DB.prepare('UPDATE bookings SET case_id = ?2 WHERE id = ?1').bind(id, caseId).run();
    } catch (err) {
      console.error('booking: could not save to records:', err && err.message);
    }
  }

  const cancelUrl = `${SITE_URL}/book-cancel?t=${encodeURIComponent(token)}`;
  try {
    await sendBrevoEmail(env, {
      to: { email, name: fullName },
      subject: t.paid ? `Consultation request received: ${whenText}` : `Consultation booked: ${whenText}`,
      html: bookingClientEmail({ fullName, paid: t.paid, cancelUrl, reference, bank: t.paid ? PAYMENT_BANK : null, ...details }),
      replyTo: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' }
    });
  } catch (err) {
    console.error('booking: client email failed:', err && err.message);
  }
  for (const to of adminEmails(env)) {
    try {
      await sendBrevoEmail(env, {
        to: { email: to },
        subject: `${reference ? `[${reference}] ` : ''}New booking: ${t.short}, ${whenText}`,
        html: bookingAdminEmail({ fullName, email, phone, paid: t.paid, reference, caseUrl: caseId ? `${SITE_URL}/admin/case/${caseId}` : null, ...details }),
        replyTo: { email, name: fullName }
      });
    } catch (err) {
      console.error('booking: admin email failed:', err && err.message);
    }
  }

  return json({ ok: true, reference, when: whenText, paid: t.paid, fee: feeText(type), bank: t.paid ? PAYMENT_BANK : null });
}
