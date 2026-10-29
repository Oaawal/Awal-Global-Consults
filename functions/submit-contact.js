import { verifyTurnstile } from './_lib/turnstile.js';
import { sendBrevoEmail } from './_lib/brevo.js';
import { contactAdminEmail, contactClientEmail } from './_lib/email-templates.js';
import { recordsEnabled, recordSubmission } from './_lib/records.js';

const HIDDEN_FIELDS = new Set(['Service', 'company_website', 'cf-turnstile-response']);
const MAX_FIELD_LENGTH = 3000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

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

    // Honeypot: real visitors never see or fill this field; bots do.
    if (String(formData.get('company_website') || '').trim()) {
      return jsonResponse({ ok: true });
    }

    // Bot check (only active once TURNSTILE_SECRET_KEY is configured)
    if (!(await verifyTurnstile(env, formData, request))) {
      return jsonResponse({ error: 'Security check failed. Please refresh the page and try again.' }, 400);
    }

    const fields = {};
    for (const [key, value] of formData.entries()) {
      if (HIDDEN_FIELDS.has(key) || typeof value !== 'string') continue;
      if (!value.trim()) continue;
      const v = value.slice(0, MAX_FIELD_LENGTH);
      fields[key] = fields[key] ? `${fields[key]}, ${v}`.slice(0, MAX_FIELD_LENGTH) : v;
    }

    const service = String(formData.get('Service') || '').trim();
    const fullName = pick(fields, 'Full Name', 'Full_Name', 'Name');
    const email = pick(fields, 'Email Address', 'Email_Address', 'Email');
    const phone = pick(fields, 'Phone Number', 'Phone_Number', 'Phone', 'Phone / WhatsApp Number');

    if (!fullName || !phone) {
      return jsonResponse({ error: 'Missing required contact details' }, 400);
    }
    if (email && !EMAIL_RE.test(email.trim())) {
      return jsonResponse({ error: 'Please enter a valid email address' }, 400);
    }

    const humanFields = {};
    for (const [key, value] of Object.entries(fields)) {
      humanFields[humanize(key)] = value;
    }

    // Save the enquiry to the records database; the email still goes out if that fails
    let reference = null;
    let caseUrl = null;
    let recordStatus = 'off';
    if (recordsEnabled(env)) {
      try {
        let caseId;
        ({ reference, caseId } = await recordSubmission(env, request, {
          kind: 'enquiry',
          fullName: fullName.slice(0, 120),
          email: email ? email.trim().slice(0, 254) : null,
          phone: phone.slice(0, 40),
          services: service ? [service] : [],
          fields: humanFields
        }));
        caseUrl = `${new URL(request.url).origin}/admin/case/${caseId}`;
        recordStatus = 'saved';
      } catch (err) {
        console.error('submit-contact: saving record failed:', err && err.message);
        recordStatus = 'failed';
      }
    }

    await sendBrevoEmail(env, {
      to: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' },
      subject: `${reference ? `[${reference}] ` : ''}New Enquiry — ${service || 'Website Contact Form'}`,
      html: contactAdminEmail({ fields: humanFields, service, reference, recordStatus, caseUrl }),
      replyTo: email ? { email, name: fullName } : undefined
    });

    if (email) {
      await sendBrevoEmail(env, {
        to: { email, name: fullName },
        subject: 'We\u2019ve Received Your Enquiry — Awal Global Consults',
        html: contactClientEmail({ fullName, service, reference })
      });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('submit-contact failed:', err && err.message);
    return jsonResponse({ error: 'Submission failed. Please try again or contact us on WhatsApp.' }, 500);
  }
}
