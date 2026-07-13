import { sendBrevoEmail } from './_lib/brevo.js';
import { contactAdminEmail, contactClientEmail } from './_lib/email-templates.js';

const HIDDEN_FIELDS = new Set(['Service']);

function humanize(key) {
  return key.replace(/_/g, ' ');
}

// Common field names across the site's contact forms (case varies slightly page to page)
function pick(fields, ...keys) {
  for (const k of keys) {
    if (fields[k]) return fields[k];
  }
  return '';
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();

    const fields = {};
    for (const [key, value] of formData.entries()) {
      if (HIDDEN_FIELDS.has(key) || typeof value !== 'string') continue;
      if (!value.trim()) continue;
      fields[key] = fields[key] ? `${fields[key]}, ${value}` : value;
    }

    const service = String(formData.get('Service') || '').trim();
    const fullName = pick(fields, 'Full Name', 'Full_Name', 'Name');
    const email = pick(fields, 'Email Address', 'Email_Address', 'Email');
    const phone = pick(fields, 'Phone Number', 'Phone_Number', 'Phone', 'Phone / WhatsApp Number');

    if (!fullName || !phone) {
      return new Response(JSON.stringify({ error: 'Missing required contact details' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const humanFields = {};
    for (const [key, value] of Object.entries(fields)) {
      humanFields[humanize(key)] = value;
    }

    await sendBrevoEmail(env, {
      to: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' },
      subject: `New Enquiry — ${service || 'Website Contact Form'}`,
      html: contactAdminEmail({ fields: humanFields, service }),
      replyTo: email ? { email, name: fullName } : undefined
    });

    if (email) {
      await sendBrevoEmail(env, {
        to: { email, name: fullName },
        subject: 'We\u2019ve Received Your Enquiry — Awal Global Consults',
        html: contactClientEmail({ fullName, service })
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}
