import { uploadUrl } from './_lib/upload-links.js';
import { checkEmail } from './_lib/email-check.js';
import { verifyTurnstile, reportBlockedSubmission } from './_lib/turnstile.js';
import { contentMatchesName } from './_lib/file-check.js';
import { sendBrevoEmail, bytesToBase64 } from './_lib/brevo.js';
import { recordsEnabled, recordSubmission } from './_lib/records.js';
import { documentContentType } from './_lib/cases.js';
import { kycAdminEmail, kycClientEmail, blockedSubmissionEmail, adminNoticeEmail } from './_lib/email-templates.js';
import { notifyAdmins } from './_lib/webpush.js';

// "Documents" supports multiple files (the new lean intake form uses one
// multi-file dropzone instead of several single-purpose upload fields).
// Signatures come first so the size budget never squeezes them out.
const MULTI_FILE_FIELDS = ['Signatures', 'LGA_Certificate', 'Documents'];

const HIDDEN_FIELDS = new Set([
  'svc', 'Services_Requested', 'Subject', 'People_Count'
]);

// Registrations need every person's details and signature; SCUML needs every person's NIN.
const REG_SERVICES = ['Business Name Registration', 'Limited Company Registration', 'Incorporated Trustees / NGO'];
const NIN_SERVICES = [...REG_SERVICES, 'SCUML Registration'];
const MAX_PEOPLE = 10;

/** Check the people section. Returns an error message for the visitor, or null. */
async function peopleProblem(formData, services, signatureNames) {
  if (!services.some(s => NIN_SERVICES.includes(s))) return null;
  const needSig = services.some(s => REG_SERVICES.includes(s));
  const n = Number(formData.get('People_Count'));
  if (!Number.isInteger(n) || n < 1 || n > MAX_PEOPLE) return 'Please add the directors, shareholders or proprietors.';
  if (services.includes('Incorporated Trustees / NGO') && !services.includes('Limited Company Registration') && n < 2) return 'CAC requires at least two trustees.';
  const get = (i, k) => String(formData.get(`Person_${i}_${k}`) || '').trim();
  const ids = new Set();
  let directors = 0, holders = 0, shareTotal = 0;
  for (let i = 1; i <= n; i++) {
    const label = get(i, 'Full_Name') || `Person ${i}`;
    if (get(i, 'Full_Name').split(/\s+/).length < 2) return `Please enter the full name of person ${i}.`;
    if (!get(i, 'Role')) return `Please choose a role for ${label}.`;
    const nin = get(i, 'NIN'), passport = get(i, 'Passport_Number');
    if (get(i, 'Nationality') === 'Other') { if (passport.length < 5) return `Please enter the passport number for ${label}.`; }
    else if (!/^\d{11}$/.test(nin)) return `The NIN for ${label} must be exactly 11 digits.`;
    const id = nin || passport;
    if (ids.has(id)) return 'The same NIN or passport number appears for two people.';
    ids.add(id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(get(i, 'Date_of_Birth'))) return `Please enter the date of birth for ${label}.`;
    if (!get(i, 'Gender')) return `Please choose the gender for ${label}.`;
    if (get(i, 'Phone').replace(/\D/g, '').length < 10) return `Please enter a valid phone number for ${label}.`;
    if (!get(i, 'Occupation') || get(i, 'Residential_Address').length < 8) return `Please complete the occupation and address for ${label}.`;
    const ec = await checkEmail(get(i, 'Email'));
    if (!ec.ok) return `${label}: ${ec.reason}`;
    if (/Director/.test(get(i, 'Role'))) directors++;
    if (/Shareholder/.test(get(i, 'Role'))) { holders++; shareTotal += Number(get(i, 'Shareholding_Percent')) || 0; }
    if (needSig && !signatureNames.some(name => name.startsWith(`signature-${i}-`))) return `A signature is required for ${label}: sign in the box or upload a photo of the signature.`;
  }
  if (services.includes('Limited Company Registration')) {
    if (!directors) return 'A company needs at least one director.';
    if (!holders) return 'A company needs at least one shareholder.';
    if (Math.abs(shareTotal - 100) > 0.01) return 'Shareholdings must add up to 100%.';
    if (!String(formData.get('Share_Capital') || '').trim()) return 'Please choose the proposed share capital.';
  }
  return null;
}

/** Check the e-passport section. Returns an error message for the visitor, or null. */
async function passportProblem(formData, services, hasLgaCert) {
  if (!services.includes('International Passport (E-passport)')) return null;
  const g = k => String(formData.get(`Passport_${k}`) || '').trim();
  const required = { Booklet: 'passport booklet', Surname: 'surname', First_Name: 'first name', Sex: 'sex', Date_of_Birth: 'date of birth', Place_of_Birth: 'place of birth',
    Address: 'address', LGA_of_Address: 'local government of address', State_of_Residence: 'state of residence', State_of_Origin: 'state of origin',
    LGA_of_Origin: 'local government area of origin', Home_Town: 'home town', Occupation: 'occupation', Marital_Status: 'marital status',
    Previous_E_Passport: 'whether you have had an e-passport', Next_of_Kin_Name: 'next of kin', Next_of_Kin_Relationship: 'relationship with next of kin',
    Next_of_Kin_Address: 'next of kin address', Next_of_Kin_LGA: 'next of kin local government', Next_of_Kin_State: 'next of kin state of residence' };
  for (const [k, label] of Object.entries(required)) if (!g(k)) return `Passport form: please enter your ${label}.`;
  if (!/^\d{11}$/.test(g('NIN'))) return 'Passport form: your NIN must be exactly 11 digits.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g('Date_of_Birth'))) return 'Passport form: please enter a valid date of birth.';
  if (g('Phone').replace(/\D/g, '').length < 10 || g('Next_of_Kin_Phone').replace(/\D/g, '').length < 10) return 'Passport form: please enter valid phone numbers for you and your next of kin.';
  const ec = await checkEmail(g('Email'));
  if (!ec.ok) return `Passport form: ${ec.reason}`;
  if (g('Previous_E_Passport') === 'Yes' && !(g('Existing_Passport_Number') && g('Existing_Date_of_Issue') && g('Existing_Expiry_Date') && g('Existing_Place_of_Issue')))
    return 'Passport form: please give your previous passport number, dates and place of issue.';
  if (!hasLgaCert && g('LGA_Certificate_Later') !== 'Yes') return 'Passport form: please upload your Certificate of Local Government of Origin, or tick that you will send it later.';
  return null;
}

/** NINs and passport numbers are shown in full only in the dashboard, never in email. */
function maskIds(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = /\b(NIN|Passport Number)\b/.test(k) ? `${'*'.repeat(Math.max(0, String(v).length - 4))}${String(v).slice(-4)}` : v;
  return out;
}

const MAX_PER_FILE_BYTES = 7 * 1024 * 1024;   // matches the 7MB per-file limit shown to users in the form
const MAX_TOTAL_ATTACH_BYTES = 25 * 1024 * 1024; // total stored per application (matches the form)
const MAX_EMAIL_ATTACH_BYTES = 14 * 1024 * 1024; // fallback email only: base64 inflates ~1.33x, Brevo caps at 20MB

function humanize(key) {
  return key.replace(/_/g, ' ');
}

// Only these document types are accepted (matches the accept= list on the form).
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const MAX_FILES = 30; // per upload field
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
      await reportBlockedSubmission(env, request, 'application', {
        'Name': formData.get('Full_Name'), 'Phone': formData.get('Phone'), 'Email': formData.get('Email'),
        'Services': formData.get('Services_Requested')
      }, rows => sendBrevoEmail(env, {
        to: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' },
        subject: 'Action needed: an application was blocked by the security check',
        html: blockedSubmissionEmail({ formLabel: 'An application', rows })
      }).then(() => notifyAdmins(env, { title: 'Application blocked by the security check', body: 'Check your email for the visitor\u2019s contact details.', url: '/admin/' })));
      return jsonResponse({ error: 'The security check did not complete. Please refresh the page and submit again, or message us on WhatsApp: +234 703 833 6596.' }, 400);
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
    const ec = await checkEmail(email);
    if (!ec.ok) return jsonResponse({ error: ec.reason, field: 'email' }, 400);

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
        const name = fieldName === 'LGA_Certificate' ? `lga-certificate-${safeFileName(file.name, 'certificate')}` : safeFileName(file.name, fieldName);
        // Reject anything that is not a PDF/JPG/PNG, and anything over the size budget
        if (!hasAllowedExtension(name) || file.size > MAX_PER_FILE_BYTES || runningBytes + file.size > MAX_TOTAL_ATTACH_BYTES) {
          skippedFiles.push(name);
          continue;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        // The contents must match the extension: a renamed file is not accepted
        if (!contentMatchesName(name, bytes)) { skippedFiles.push(name); continue; }
        runningBytes += file.size;
        attachments.push({ name, content: bytesToBase64(bytes) });
        // Content type comes from the (already checked) extension, never from the browser
        storedFiles.push({ name, type: documentContentType(name), bytes });
      }
    }


    const signatureNames = formData.getAll('Signatures').filter(f => typeof f !== 'string' && f.size > 0)
      .map(f => safeFileName(f.name, 'signature')).filter(name => !skippedFiles.includes(name));
    const peopleError = await peopleProblem(formData, services, signatureNames);
    if (peopleError) return jsonResponse({ error: peopleError, field: 'people' }, 400);
    const passportError = await passportProblem(formData, services, storedFiles.some(f => f.name.startsWith('lga-certificate-')));
    if (passportError) return jsonResponse({ error: passportError, field: 'passport' }, 400);

    const subjectServices = services.slice(0, 3).join(', ') || 'New Submission';

    // Save the client, case and documents to the records database. If that fails,
    // the submission still goes through by email and the admin email says so.
    let reference = null;
    let caseUrl = null;
    let uploadLink = null;
    let recordStatus = 'off';
    if (recordsEnabled(env)) {
      try {
        let caseId;
        ({ reference, caseId } = await recordSubmission(env, request, {
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
        caseUrl = `${new URL(request.url).origin}/admin/case/${caseId}`;
        uploadLink = await uploadUrl(env, caseId, new URL(request.url).origin);
        recordStatus = 'saved';
      } catch (err) {
        console.error('submit-kyc: saving record failed:', err && err.message);
        recordStatus = 'failed';
      }
    }

    // Documents stay in private storage and are opened from the dashboard; the email
    // carries a link only. If the records could not be saved, attach them so nothing is lost.
    const linkOnly = recordStatus === 'saved';
    const notes = [];
    if (skippedFiles.length > 0) notes.push(`These documents were NOT received (unsupported file type or too large). They can upload them again with their private upload link: ${skippedFiles.join(', ')}`);
    if (attachments.length === 0) notes.push('No documents were attached to this submission.');
    else if (linkOnly) notes.push(`${attachments.length} document${attachments.length === 1 ? '' : 's'} saved securely. Open the case in the dashboard to view ${attachments.length === 1 ? 'it' : 'them'}.`);
    const attachmentsNote = notes.join(' ');

    // Saved to the dashboard: send a short alert only. Not saved: send everything so nothing is lost.
    if (linkOnly) {
      await sendBrevoEmail(env, {
        to: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' },
        subject: `[${reference}] New application: ${subjectServices}`,
        html: adminNoticeEmail({
          heading: 'New application', reference, services, caseUrl,
          lines: [`${attachments.length} document${attachments.length === 1 ? '' : 's'} received${skippedFiles.length ? `; ${skippedFiles.length} could not be received` : ''}.`]
        })
      });
    } else {
      await sendBrevoEmail(env, {
        to: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' },
        subject: `${reference ? `[${reference}] ` : ''}Client Intake Received: ${subjectServices}`,
        html: kycAdminEmail({ fields: maskIds(fields), services, attachmentsNote, reference, recordStatus, caseUrl, documentsSaved: false }),
        replyTo: { email, name: fullName },
        attachments: (() => { let t = 0; return attachments.filter(a => (t += a.content.length * 0.75) <= MAX_EMAIL_ATTACH_BYTES); })()
      });
    }
    await notifyAdmins(env, {
      title: `New application${reference ? ` ${reference}` : ''}`,
      body: subjectServices,
      url: caseUrl ? new URL(caseUrl).pathname : '/admin/cases',
      tag: reference || undefined
    });

    await sendBrevoEmail(env, {
      to: { email, name: fullName },
      subject: `We've Received Your Request: ${subjectServices}${reference ? ` (Ref ${reference})` : ''}`,
      html: kycClientEmail({ fullName, services, attachedCount: attachments.length, skippedFiles, reference, uploadLink })
    });

    return jsonResponse({
      ok: true,
      attachedCount: attachments.length,
      skippedFiles,
      reference,
      uploadLink
    });
  } catch (err) {
    // Log the real reason server-side only; never expose internals to visitors.
    console.error('submit-kyc failed:', err && err.message);
    return jsonResponse({ error: 'Submission failed. Please try again or contact us on WhatsApp.' }, 500);
  }
}
