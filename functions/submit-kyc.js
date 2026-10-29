import { verifyTurnstile } from './_lib/turnstile.js';
import { sendBrevoEmail, bytesToBase64 } from './_lib/brevo.js';
import { recordsEnabled, recordSubmission } from './_lib/records.js';
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

// Only these document types are accepted (matches the accept= list on the form).
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const MAX_FILES = 12;
const MAX_FIELD_LENGTH = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function safeFileName(name, fallback) {
  const cleaned = String(name || '').replace(/[\\/\r\n\0]/g, '_').slice(0, 120);
  return cleaned || fallback;
}

function hasAllowedExtension(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return !!m && ALLOWED_EXTENSIONS.has(m[1].toLowerCase());
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();

    // Honeypot: real visitors never see or fill this field; bots do.
    if (String(formData.get('company_website') || '').trim()) {
      return jsonResponse({ ok: true, attachedCount: 0, skippedFiles: [] });
    }

    // Bot check (only active once TURNSTILE_SECRET_KEY is configured)
    if (!(await verifyTurnstile(env, formData, request))) {
      return jsonResponse({ error: 'Security check failed. Please refresh the page and try again.' }, 400);
    }

    // Group text fields (handles repeated keys like multi-checked checkboxes)
    const grouped = {};
    for (const [key, value] of formData.entries()) {
      if (MULTI_FILE_FIELDS.includes(key) || HIDDEN_FIELDS.has(key)) continue;
      if (key === 'company_website' || key === 'cf-turnstile-response') continue;
      if (typeof value !== 'string') continue; // skip file entries
      if (!(key in grouped)) grouped[key] = [];
      grouped[key].push(value);
    }
    const fields = {};
    for (const [key, values] of Object.entries(grouped)) {
      const joined = values.filter(Boolean).join(', ').slice(0, MAX_FIELD_LENGTH);
      if (joined) fields[humanize(key)] = joined;
    }

    const servicesRaw = String(formData.get('Services_Requested') || '');
    const services = servicesRaw.split(',').map(s => s.trim()).filter(Boolean);
    const fullName = String(formData.get('Full_Name') || '').trim().slice(0, 120);
    const email = String(formData.get('Email') || '').trim().slice(0, 254);

    if (!fullName || !email) {
      return jsonResponse({ error: 'Missing required contact details' }, 400);
    }
    if (!EMAIL_RE.test(email)) {
      return jsonResponse({ error: 'Please enter a valid email address' }, 400);
    }

    // Build attachments from every uploaded file, capped so the email stays within Brevo's size limits
    let runningBytes = 0;
    const attachments = [];
    const storedFiles = [];
    const skippedFiles = [];
    for (const fieldName of MULTI_FILE_FIELDS) {
      const files = formData.getAll(fieldName)
        .filter(f => typeof f !== 'string' && f.size > 0)
        .slice(0, MAX_FILES);
      for (const file of files) {
        const name = safeFileName(file.name, fieldName);
        // Reject anything that is not a PDF/JPG/PNG, and anything over the size budget
        if (!hasAllowedExtension(name) || file.size > MAX_PER_FILE_BYTES || runningBytes + file.size > MAX_TOTAL_ATTACH_BYTES) {
          skippedFiles.push(name);
          continue;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        runningBytes += file.size;
        attachments.push({ name, content: bytesToBase64(bytes) });
        storedFiles.push({ name, type: file.type, bytes });
      }
    }

    const attachmentsNote = skippedFiles.length > 0
      ? `These documents were NOT received (unsupported file type or too large) — ask the client to resend directly on WhatsApp: ${skippedFiles.join(', ')}`
      : (attachments.length === 0 ? 'No documents were attached to this submission.' : '');

    const subjectServices = services.slice(0, 3).join(', ') || 'New Submission';

    // Save the client, case and documents to the records database. If that fails,
    // the submission still goes through by email and the admin email says so.
    let reference = null;
    let recordStatus = 'off';
    if (recordsEnabled(env)) {
      try {
        ({ reference } = await recordSubmission(env, request, {
          kind: 'application',
          fullName,
          email,
          phone: String(formData.get('Phone') || formData.get('Phone_Number') || '').slice(0, 40),
          services,
          fields,
          consentAccuracy: formData.get('Declaration_Accurate') === 'Yes',
          consentProcessing: formData.get('Declaration_Consent') === 'Yes',
          files: storedFiles
        }));
        recordStatus = 'saved';
      } catch (err) {
        console.error('submit-kyc: saving record failed:', err && err.message);
        recordStatus = 'failed';
      }
    }

    await sendBrevoEmail(env, {
      to: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' },
      subject: `${reference ? `[${reference}] ` : ''}Client Intake Received — ${subjectServices}`,
      html: kycAdminEmail({ fields, services, attachmentsNote, reference, recordStatus }),
      replyTo: { email, name: fullName },
      attachments
    });

    await sendBrevoEmail(env, {
      to: { email, name: fullName },
      subject: `We've Received Your Request — ${subjectServices}${reference ? ` (Ref ${reference})` : ''}`,
      html: kycClientEmail({ fullName, services, attachedCount: attachments.length, skippedFiles, reference })
    });

    return jsonResponse({
      ok: true,
      attachedCount: attachments.length,
      skippedFiles,
      reference
    });
  } catch (err) {
    // Log the real reason server-side only; never expose internals to visitors.
    console.error('submit-kyc failed:', err && err.message);
    return jsonResponse({ error: 'Submission failed. Please try again or contact us on WhatsApp.' }, 500);
  }
}
