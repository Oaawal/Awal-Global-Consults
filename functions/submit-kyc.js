import { sendBrevoEmail, fileToBase64 } from './_lib/brevo.js';
import { kycAdminEmail, kycClientEmail } from './_lib/email-templates.js';

// "Documents" supports multiple files (the new lean intake form uses one
// multi-file dropzone instead of several single-purpose upload fields).
const MULTI_FILE_FIELDS = ['Documents'];

const HIDDEN_FIELDS = new Set([
  'svc', 'Services_Requested', 'Subject'
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
      if (MULTI_FILE_FIELDS.includes(key) || HIDDEN_FIELDS.has(key)) continue;
      if (typeof value !== 'string') continue; // skip file entries
      if (!(key in grouped)) grouped[key] = [];
      grouped[key].push(value);
    }
    const fields = {};
    for (const [key, values] of Object.entries(grouped)) {
      const joined = values.filter(Boolean).join(', ');
      if (joined) fields[humanize(key)] = joined;
    }

    const servicesRaw = String(formData.get('Services_Requested') || '');
    const services = servicesRaw.split(',').map(s => s.trim()).filter(Boolean);
    const fullName = String(formData.get('Full_Name') || '');
    const email = String(formData.get('Email') || '');

    if (!fullName || !email) {
      return new Response(JSON.stringify({ error: 'Missing required contact details' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    // Build attachments from every uploaded file, capped so the email stays within Brevo's size limits
    let runningBytes = 0;
    let skippedForSize = false;
    const attachments = [];
    for (const fieldName of MULTI_FILE_FIELDS) {
      const files = formData.getAll(fieldName).filter(f => typeof f !== 'string' && f.size > 0);
      for (const file of files) {
        if (file.size > MAX_PER_FILE_BYTES || runningBytes + file.size > MAX_TOTAL_ATTACH_BYTES) {
          skippedForSize = true;
          continue;
        }
        const b64 = await fileToBase64(file, MAX_PER_FILE_BYTES);
        if (!b64) { skippedForSize = true; continue; }
        runningBytes += file.size;
        attachments.push({ name: file.name || fieldName, content: b64 });
      }
    }

    const attachmentsNote = skippedForSize
      ? 'One or more uploaded documents were too large to attach to this email. Please request them directly from the client via WhatsApp.'
      : (attachments.length === 0 ? 'No documents were attached to this submission.' : '');

    const subjectServices = services.slice(0, 3).join(', ') || 'New Submission';

    await sendBrevoEmail(env, {
      to: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' },
      subject: `Client Intake Received — ${subjectServices}`,
      html: kycAdminEmail({ fields, services, attachmentsNote }),
      attachments
    });

    await sendBrevoEmail(env, {
      to: { email, name: fullName },
      subject: `We've Received Your Request — ${subjectServices}`,
      html: kycClientEmail({ fullName, services })
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
