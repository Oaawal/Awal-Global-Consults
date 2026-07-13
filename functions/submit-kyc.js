import { sendBrevoEmail, fileToBase64 } from './_lib/brevo.js';
import { kycAdminEmail, kycClientEmail } from './_lib/email-templates.js';

const FILE_FIELDS = [
  'ID_Document', 'Passport_Photo', 'Signature', 'Additional_Docs',
  'Director_ID', 'Director_Photo', 'Director_Signature'
];

const HIDDEN_FIELDS = new Set([
  'svc', 'Services_Requested', 'Estimated_Total', 'Has_Fixed_Price', 'Resume_ID', 'Subject'
]);

const MAX_PER_FILE_BYTES = 5 * 1024 * 1024;   // matches the 5MB limit shown to users in the form
const MAX_TOTAL_ATTACH_BYTES = 6 * 1024 * 1024; // keep total email payload comfortably under Brevo's cap

function humanize(key) {
  return key.replace(/_/g, ' ');
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();

    // Group text fields (handles repeated keys like multi-checked checkboxes)
    const grouped = {};
    for (const [key, value] of formData.entries()) {
      if (FILE_FIELDS.includes(key) || HIDDEN_FIELDS.has(key)) continue;
      if (!(key in grouped)) grouped[key] = [];
      grouped[key].push(typeof value === 'string' ? value : '');
    }
    const fields = {};
    for (const [key, values] of Object.entries(grouped)) {
      const joined = values.filter(Boolean).join(', ');
      if (joined) fields[humanize(key)] = joined;
    }

    const servicesRaw = String(formData.get('Services_Requested') || '');
    const services = servicesRaw.split(',').map(s => s.trim()).filter(Boolean);
    const estimatedTotal = String(formData.get('Estimated_Total') || '');
    const hasFixedPrice = String(formData.get('Has_Fixed_Price') || 'false') === 'true';
    const resumeId = String(formData.get('Resume_ID') || '');
    const fullName = String(formData.get('Full_Name') || '');
    const email = String(formData.get('Email') || '');

    if (!fullName || !email) {
      return new Response(JSON.stringify({ error: 'Missing required contact details' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    // Build attachments, capped so the email stays within Brevo's size limits
    let runningBytes = 0;
    let skippedForSize = false;
    const attachments = [];
    for (const fieldName of FILE_FIELDS) {
      const file = formData.get(fieldName);
      if (!file || typeof file === 'string' || file.size === 0) continue;
      if (file.size > MAX_PER_FILE_BYTES || runningBytes + file.size > MAX_TOTAL_ATTACH_BYTES) {
        skippedForSize = true;
        continue;
      }
      const b64 = await fileToBase64(file, MAX_PER_FILE_BYTES);
      if (!b64) { skippedForSize = true; continue; }
      runningBytes += file.size;
      attachments.push({ name: file.name || fieldName, content: b64 });
    }

    const attachmentsNote = skippedForSize
      ? 'One or more uploaded documents were too large to attach to this email. Please request them directly from the client via WhatsApp.'
      : (attachments.length === 0 ? 'No documents were attached to this submission.' : '');

    const subjectServices = services.slice(0, 3).join(', ') || 'New Submission';

    await sendBrevoEmail(env, {
      to: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' },
      subject: `KYC Application Received — ${subjectServices}`,
      html: kycAdminEmail({ fields, services, estimatedTotal, resumeId, attachmentsNote }),
      attachments
    });

    await sendBrevoEmail(env, {
      to: { email, name: fullName },
      subject: `KYC Application Received — ${subjectServices}`,
      html: kycClientEmail({ fullName, services, hasFixedPrice, resumeId })
    });

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
