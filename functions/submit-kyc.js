import { sendBrevoEmail, fileToBase64 } from './_lib/brevo.js';
import { kycAdminEmail, kycClientEmail } from './_lib/email-templates.js';

// "Documents" supports multiple files (the new lean intake form uses one
// multi-file dropzone instead of several single-purpose upload fields).
const MULTI_FILE_FIELDS = ['Documents'];

const HIDDEN_FIELDS = new Set([
  'svc', 'Services_Requested', 'Subject'
]);

const MAX_PER_FILE_BYTES = 7 * 1024 * 1024;   // matches the 7MB per-file limit shown to users in the form
const MAX_TOTAL_ATTACH_BYTES = 14 * 1024 * 1024; // raw-byte budget; base64 inflates ~1.33x, keeping the encoded payload safely under Brevo's 20MB total cap

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
    const attachments = [];
    const skippedFiles = [];
    for (const fieldName of MULTI_FILE_FIELDS) {
      const files = formData.getAll(fieldName).filter(f => typeof f !== 'string' && f.size > 0);
      for (const file of files) {
        if (file.size > MAX_PER_FILE_BYTES || runningBytes + file.size > MAX_TOTAL_ATTACH_BYTES) {
          skippedFiles.push(file.name || fieldName);
          continue;
        }
        const b64 = await fileToBase64(file, MAX_PER_FILE_BYTES);
        if (!b64) { skippedFiles.push(file.name || fieldName); continue; }
        runningBytes += file.size;
        attachments.push({ name: file.name || fieldName, content: b64 });
      }
    }

    const attachmentsNote = skippedFiles.length > 0
      ? `These documents were too large to attach and were NOT received — ask the client to resend directly on WhatsApp: ${skippedFiles.join(', ')}`
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
      html: kycClientEmail({ fullName, services, attachedCount: attachments.length, skippedFiles })
    });

    return new Response(JSON.stringify({
      ok: true,
      attachedCount: attachments.length,
      skippedFiles
    }), {
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
