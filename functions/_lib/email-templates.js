import { WHATSAPP_LINK } from './brevo.js';

const NAVY = '#0F3A5F';
const GOLD = '#2F80ED';
const GOLD_PALE = '#f9f0dc'; // warning-banner background only: intentionally not a brand color
const BG = '#F4F8FC';
const BORDER = '#D7E6F2';
const TEXT = '#222222';
const MUTED = '#555555';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wraps inner HTML in the shared navy/gold branded shell. */
function shell(innerHtml, { preheader = '' } = {}) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${BG};font-family:'DM Sans',Arial,sans-serif;color:${TEXT};">
  <span style="display:none;font-size:1px;color:${BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid ${BORDER};">
        <tr>
          <td style="background:${NAVY};padding:24px 28px;border-bottom:3px solid ${GOLD};">
            <div style="font-family:Georgia,'Fraunces',serif;color:#ffffff;font-size:19px;font-weight:700;">Awal Global Consults</div>
            <div style="color:rgba(255,255,255,0.55);font-size:11px;margin-top:2px;">Legal, Governance, Risk & Compliance</div>
          </td>
        </tr>
        <tr><td style="padding:28px;">${innerHtml}</td></tr>
        <tr>
          <td style="background:${BG};padding:18px 28px;border-top:1px solid ${BORDER};font-size:11px;color:${MUTED};">
            Awal Global Consults Limited (RC-9282103) · info@awalglobal.com.ng · <a href="${WHATSAPP_LINK}" style="color:${NAVY};">WhatsApp</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function referenceHtml(reference) {
  if (!reference) return '';
  return `<div style="background:${BG};border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:${TEXT};">
    Your reference number: <strong style="color:${NAVY};font-size:15px;letter-spacing:0.5px;">${escapeHtml(reference)}</strong><br>
    <span style="font-size:12px;color:${MUTED};">Please quote it whenever you contact us about this request.</span>
  </div>`;
}

/** Admin-only line saying whether the submission was saved to the records database. */
function recordStatusHtml(reference, recordStatus, caseUrl) {
  if (recordStatus === 'saved') {
    return `<div style="font-size:12.5px;color:${NAVY};background:${BG};border:1px solid ${BORDER};border-radius:6px;padding:8px 12px;margin-bottom:12px;">Saved to client records as <strong>${escapeHtml(reference)}</strong>.${caseUrl ? ` <a href="${escapeHtml(caseUrl)}" style="color:${NAVY};font-weight:700;">Open case in dashboard →</a>` : ''}</div>`;
  }
  if (recordStatus === 'failed') {
    return `<div style="font-size:12.5px;color:#a05a00;background:${GOLD_PALE};border-radius:6px;padding:8px 12px;margin-bottom:12px;"><strong>Not saved to client records</strong>: the records database could not be reached. Keep this email (and its attachments) as the record.</div>`;
  }
  return '';
}

function serviceListHtml(services) {
  if (!services || services.length === 0) return '';
  return `<div style="background:${BG};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;margin:16px 0;">
    ${services.map(s => `<div style="padding:4px 0;font-size:13px;color:${TEXT};"><span style="color:${GOLD};font-weight:700;">✓</span> ${escapeHtml(s)}</div>`).join('')}
  </div>`;
}

// ── Application: client confirmation email ──────────────────────
export function kycClientEmail({ fullName, services, attachedCount = 0, skippedFiles = [], reference = null }) {
  const docLine = skippedFiles.length > 0
    ? `<div style="font-size:12.5px;color:#a05a00;background:${GOLD_PALE};border-radius:6px;padding:10px 14px;margin:14px 0;">${attachedCount > 0 ? `We received ${attachedCount} document${attachedCount === 1 ? '' : 's'}, but ` : 'We could not receive '}the following ${skippedFiles.length === 1 ? 'file was' : 'files were'} not received (unsupported file type or too large): <strong>${escapeHtml(skippedFiles.join(', '))}</strong>. Please resend ${skippedFiles.length === 1 ? 'it' : 'them'} directly on <a href="${WHATSAPP_LINK}" style="color:#a05a00;font-weight:600;">WhatsApp</a>.</div>`
    : (attachedCount > 0
      ? `<div style="font-size:13px;color:${TEXT};margin:14px 0;">✓ We received <strong>${attachedCount} document${attachedCount === 1 ? '' : 's'}</strong> along with your request.</div>`
      : '');
  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:20px;margin:0 0 12px;">Thank you, ${escapeHtml(fullName || 'valued client')}</h2>
    <p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 8px;">
      We've received your application. Our team will review your request and get back to you within
      <strong>1 working day</strong> with a clear, itemized quote and confirmation of any documents still needed.
      No payment is needed until then.
    </p>
    ${referenceHtml(reference)}
    ${trackLinkHtml(reference)}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${GOLD};margin-top:20px;">Services Requested</div>
    ${serviceListHtml(services)}
    ${docLine}
    <div style="margin:16px 0;padding:14px 16px;background:${BG};border-left:3px solid ${NAVY};border-radius:0 8px 8px 0;font-size:13px;color:${NAVY};">Once you're happy with your quote, we'll share our bank transfer details and begin processing right away.</div>
    <div style="margin-top:22px;padding-top:18px;border-top:1px solid ${BORDER};font-size:13px;color:${TEXT};">
      Have documents to send, or a question in the meantime? Chat with us directly on <a href="${WHATSAPP_LINK}" style="color:${NAVY};font-weight:600;">WhatsApp</a>.
    </div>`;
  return shell(inner, { preheader: 'We\'ve received your request: here\'s what happens next.' });
}

// ── Application: admin notification email ───────────────────────
export function kycAdminEmail({ fields, services, attachmentsNote, reference = null, recordStatus = 'off', caseUrl = null }) {
  const rows = Object.entries(fields)
    .filter(([, v]) => v !== '' && v !== undefined && v !== null)
    .map(([k, v]) => `<tr><td style="padding:6px 10px;border-bottom:1px solid ${BORDER};font-size:12px;color:${MUTED};white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:6px 10px;border-bottom:1px solid ${BORDER};font-size:12.5px;color:${TEXT};">${escapeHtml(v)}</td></tr>`)
    .join('');

  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:18px;margin:0 0 6px;">New Client Intake${reference ? `: ${escapeHtml(reference)}` : ''}</h2>
    <div style="font-size:12.5px;color:${MUTED};margin-bottom:14px;">Remember to send a quote within 1 working day.</div>
    ${recordStatusHtml(reference, recordStatus, caseUrl)}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${GOLD};margin-top:10px;">Services Requested</div>
    ${serviceListHtml(services)}
    ${attachmentsNote ? `<div style="font-size:12px;color:#a05a00;background:${GOLD_PALE};border-radius:6px;padding:8px 12px;margin-bottom:12px;">${escapeHtml(attachmentsNote)}</div>` : ''}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${GOLD};margin-top:16px;margin-bottom:8px;">Submitted Details</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`;
  return shell(inner, { preheader: 'New client intake submission received.' });
}

// ── Contact form: client acknowledgement email ──────────────────
export function contactClientEmail({ fullName, service, reference = null }) {
  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:20px;margin:0 0 12px;">Thank you, ${escapeHtml(fullName || 'there')}</h2>
    <p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 8px;">
      We've received your enquiry${service ? ` about <strong>${escapeHtml(service)}</strong>` : ''}. A member of our team will
      review it and get back to you shortly.
    </p>
    ${referenceHtml(reference)}
    <div style="margin-top:20px;padding-top:18px;border-top:1px solid ${BORDER};font-size:13px;color:${TEXT};">
      Need a faster response? Chat with us directly on <a href="${WHATSAPP_LINK}" style="color:${NAVY};font-weight:600;">WhatsApp</a>.
    </div>`;
  return shell(inner, { preheader: 'We\'ve received your enquiry: a consultant will be in touch shortly.' });
}

// ── Contact form: admin notification email ──────────────────────
export function contactAdminEmail({ fields, service, reference = null, recordStatus = 'off', caseUrl = null }) {
  const rows = Object.entries(fields)
    .filter(([, v]) => v !== '' && v !== undefined && v !== null)
    .map(([k, v]) => `<tr><td style="padding:6px 10px;border-bottom:1px solid ${BORDER};font-size:12px;color:${MUTED};white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:6px 10px;border-bottom:1px solid ${BORDER};font-size:12.5px;color:${TEXT};">${escapeHtml(v)}</td></tr>`)
    .join('');

  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:18px;margin:0 0 6px;">New Enquiry${service ? `: ${escapeHtml(service)}` : ''}</h2>
    ${recordStatusHtml(reference, recordStatus, caseUrl)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10px;">${rows}</table>`;
  return shell(inner, { preheader: `New website enquiry${service ? `: ${service}` : ''}.` });
}

// ── Admin dashboard: login code email ───────────────────────────
export function adminLoginCodeEmail({ code }) {
  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:18px;margin:0 0 12px;">Your dashboard login code</h2>
    <div style="font-size:30px;font-weight:700;letter-spacing:8px;color:${NAVY};background:${BG};border:1px solid ${BORDER};border-radius:8px;padding:16px;text-align:center;margin:12px 0;">${escapeHtml(code)}</div>
    <p style="font-size:13px;line-height:1.7;color:${MUTED};margin:0;">
      This code expires in 10 minutes and can only be used once. If you did not try to sign in, you can ignore this email:
      nobody can sign in without the code.
    </p>`;
  return shell(inner, { preheader: `Your login code is ${code}` });
}

// ── Case status update email to the client ──────────────────────
export function caseStatusEmail({ fullName, reference, statusLabel, statusMessage, note }) {
  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:20px;margin:0 0 12px;">Update on your request</h2>
    <p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 8px;">Dear ${escapeHtml(fullName || 'valued client')},</p>
    <div style="background:${BG};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;margin:16px 0;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${GOLD};">Reference ${escapeHtml(reference)}</div>
      <div style="font-size:16px;font-weight:700;color:${NAVY};margin-top:4px;">${escapeHtml(statusLabel)}</div>
    </div>
    ${statusMessage ? `<p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 8px;">${escapeHtml(statusMessage)}</p>` : ''}
    ${note ? `<div style="margin:14px 0;padding:12px 16px;background:${BG};border-left:3px solid ${NAVY};border-radius:0 8px 8px 0;font-size:13.5px;line-height:1.7;color:${TEXT};white-space:pre-line;">${escapeHtml(note)}</div>` : ''}
    ${trackLinkHtml(reference)}
    <div style="margin-top:22px;padding-top:18px;border-top:1px solid ${BORDER};font-size:13px;color:${TEXT};">
      Questions? Reply to this email or chat with us on <a href="${WHATSAPP_LINK}" style="color:${NAVY};font-weight:600;">WhatsApp</a>, quoting your reference number.
    </div>`;
  return shell(inner, { preheader: `${reference}: ${statusLabel}` });
}

function trackLinkHtml(reference) {
  if (!reference) return '';
  return `<div style="font-size:13px;color:${TEXT};margin:14px 0;">Check the status of your request any time at
    <a href="https://awalglobal.com.ng/track" style="color:${NAVY};font-weight:600;">awalglobal.com.ng/track</a> with your reference number and email address.</div>`;
}

// ── Automatic reminder to a client we are waiting on ────────────
export function caseReminderEmail({ fullName, reference, status, reminderNumber }) {
  const waitingForDocs = status === 'awaiting_documents';
  const lead = waitingForDocs
    ? 'We are still waiting for some documents or information from you before we can continue with your request.'
    : 'We sent you a quote for your request and wanted to check whether you have any questions about it.';
  const ask = waitingForDocs
    ? 'Please send them on WhatsApp or reply to this email, and we will pick things up straight away.'
    : 'When you are ready to go ahead, just reply to this email or message us on WhatsApp.';
  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:20px;margin:0 0 12px;">${reminderNumber > 1 ? 'A quick follow-up' : 'Just checking in'}</h2>
    <p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 8px;">Dear ${escapeHtml(fullName || 'valued client')},</p>
    <p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 8px;">${lead}</p>
    <div style="background:${BG};border:1px solid ${BORDER};border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:${TEXT};">
      Reference: <strong style="color:${NAVY};">${escapeHtml(reference)}</strong>
    </div>
    <p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 8px;">${ask}</p>
    <div style="margin-top:20px;"><a href="${WHATSAPP_LINK}?text=${encodeURIComponent(`Hello, about my request ${reference}`)}" style="display:inline-block;background:#25d366;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px;font-size:14px;">Message us on WhatsApp</a></div>
    <p style="font-size:12px;line-height:1.6;color:${MUTED};margin:18px 0 0;">If you have already replied or decided not to proceed, please ignore this message, or let us know and we will stop the reminders.</p>`;
  return shell(inner, { preheader: waitingForDocs ? `We need a few more things for ${reference}` : `Any questions about your quote for ${reference}?` });
}

// ── Daily summary for you ───────────────────────────────────────
function summarySection(title, rows, empty) {
  if (!rows.length && !empty) return '';
  const body = rows.length
    ? rows.map(r => `<tr><td style="padding:8px 0;border-top:1px solid ${BORDER};font-size:13px;color:${TEXT};vertical-align:top;">
        <a href="${escapeHtml(r.url)}" style="color:${NAVY};font-weight:700;text-decoration:none;">${escapeHtml(r.reference)}</a> · ${escapeHtml(r.name)}
        <div style="color:${MUTED};font-size:12px;margin-top:2px;">${escapeHtml(r.detail)}</div></td></tr>`).join('')
    : `<tr><td style="padding:6px 0;font-size:13px;color:${MUTED};">${escapeHtml(empty)}</td></tr>`;
  return `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${GOLD};margin:20px 0 4px;">${escapeHtml(title)} (${rows.length})</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${body}</table>`;
}

export function dailySummaryEmail({ dateLabel, counts, newCases, waiting, inProgress, followUps, remindersSent, retentionDue, dashboardUrl, consultations = [], digest = null }) {
  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:20px;margin:0 0 4px;">Good morning</h2>
    <div style="font-size:13px;color:${MUTED};">${escapeHtml(dateLabel)} · in the last 24 hours: <strong>${counts.applications}</strong> new application${counts.applications === 1 ? '' : 's'}, <strong>${counts.enquiries}</strong> enquir${counts.enquiries === 1 ? 'y' : 'ies'}</div>
    ${summarySection('Consultations today and tomorrow', consultations)}
    ${summarySection('Needs your reply', newCases)}
    ${summarySection('Follow-ups due', followUps)}
    ${summarySection('Waiting on the client', waiting)}
    ${summarySection('In progress', inProgress)}
    ${summarySection('Reminders sent to clients this morning', remindersSent)}
    ${digest ? `<div style="font-size:12.5px;color:${NAVY};background:${BG};border:1px solid ${BORDER};border-radius:6px;padding:10px 14px;margin-top:20px;">Weekly guides email sent to <strong>${digest.sent}</strong> subscriber${digest.sent === 1 ? '' : 's'}${digest.remaining ? ` (${digest.remaining} more tomorrow)` : ''}.</div>` : ''}
    ${retentionDue ? `<div style="font-size:12.5px;color:#a05a00;background:${GOLD_PALE};border-radius:6px;padding:10px 14px;margin-top:20px;"><strong>${retentionDue}</strong> record${retentionDue === 1 ? ' has' : 's have'} passed the retention period and should be reviewed for deletion.</div>` : ''}
    <div style="margin-top:24px;"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:${NAVY};color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px;font-size:14px;">Open dashboard</a></div>`;
  return shell(inner, { preheader: `${newCases.length} need a reply · ${followUps.length} follow-ups due · ${waiting.length} waiting on clients` });
}

// ── Newsletter ───────────────────────────────────────────────────
function buttonHtml(href, label) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${GOLD};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;">${escapeHtml(label)}</a>`;
}

export function subscribeConfirmEmail({ confirmUrl }) {
  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:20px;margin:0 0 12px;">Please confirm your subscription</h2>
    <p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 16px;">Thanks for signing up for Awal Guides updates: new guides and important legal, tax and compliance changes for Nigerian businesses, usually once a week. Tap the button to confirm.</p>
    <p style="margin:0 0 18px;">${buttonHtml(confirmUrl, 'Confirm my subscription')}</p>
    <p style="font-size:12.5px;line-height:1.7;color:${MUTED};margin:0;">If you didn't sign up, ignore this email and you won't hear from us again.</p>`;
  return shell(inner, { preheader: 'One tap to confirm your Awal Guides updates.' });
}

export function digestEmail({ guides, moreCount = 0, unsubscribeUrl }) {
  const items = guides.map(g => `
    <div style="padding:14px 0;border-bottom:1px solid ${BORDER};">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${GOLD};">${escapeHtml(g.topic)}</div>
      <a href="${escapeHtml(g.url)}" style="display:block;font-family:Georgia,'Fraunces',serif;font-size:16.5px;font-weight:700;color:${NAVY};text-decoration:none;margin:4px 0 6px;">${escapeHtml(g.title)}</a>
      <div style="font-size:13.5px;line-height:1.65;color:${TEXT};">${escapeHtml(g.description)}</div>
    </div>`).join('');
  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:20px;margin:0 0 6px;">New this week on Awal Guides</h2>
    <p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 6px;">The latest legal, tax and compliance guides for Nigerian businesses and Nigerians abroad.</p>
    ${items}
    ${moreCount ? `<p style="font-size:14px;margin:16px 0 0;"><a href="https://awalglobal.com.ng/blog/" style="color:${NAVY};font-weight:700;">See ${moreCount} more new guide${moreCount === 1 ? '' : 's'} on the blog →</a></p>` : ''}
    <p style="margin:22px 0 6px;">${buttonHtml('https://awalglobal.com.ng/book', 'Book a free consultation')}</p>
    <p style="font-size:12px;line-height:1.7;color:${MUTED};margin:18px 0 0;">You're receiving this because you subscribed on awalglobal.com.ng. <a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};">Unsubscribe</a></p>`;
  return shell(inner, { preheader: guides.map(g => g.title).slice(0, 2).join(' · ') });
}

// ── Consultation bookings ────────────────────────────────────────
function bookingDetailsHtml({ reference, typeLabel, whenText, modeLabel, feeText, topic }) {
  const row = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;font-size:12.5px;color:${MUTED};vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:4px 0;font-size:13.5px;color:${TEXT};">${escapeHtml(v)}</td></tr>` : '';
  return `<div style="background:${BG};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;margin:16px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0">
      ${row('Reference', reference)}${row('Consultation', typeLabel)}${row('When', whenText + ' (Lagos time)')}${row('How', modeLabel)}${row('Fee', feeText)}${row('Topic', topic)}
    </table></div>`;
}

function paymentHtml(bank, reference) {
  if (!bank) return '';
  return `<div style="background:#ffffff;border:1px solid ${BORDER};border-left:3px solid ${GOLD};border-radius:8px;padding:14px 16px;margin:16px 0;font-size:13.5px;line-height:1.7;color:${TEXT};">
    <strong style="color:${NAVY};">How to pay</strong><br>
    Please wait until we confirm the exact fee for your matter, then pay by bank transfer to:<br>
    <strong>${escapeHtml(bank.bank)}</strong> · ${escapeHtml(bank.accountName)} · <strong>${escapeHtml(bank.accountNumber)}</strong><br>
    ${reference ? `Use <strong>${escapeHtml(reference)}</strong> as the payment description, and reply` : 'Reply'} to this email with your proof of payment.
  </div>`;
}

export function bookingClientEmail({ fullName, paid, cancelUrl, bank = null, ...d }) {
  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:20px;margin:0 0 12px;">${paid ? 'Your consultation request' : 'Your consultation is booked'}</h2>
    <p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 8px;">Dear ${escapeHtml(fullName || 'valued client')},</p>
    <p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 8px;">${paid
      ? 'Thank you for booking a paid consultation. We’ve reserved your time. Paid consultations start from ₦20,000, depending on the scope of your matter. We’ll email you the exact fee shortly, and your session is confirmed once payment is received.'
      : 'Thank you for booking. Your free consultation is confirmed for the time below.'}</p>
    ${bookingDetailsHtml(d)}
    ${paid ? paymentHtml(bank, d.reference) : ''}
    <p style="font-size:13.5px;line-height:1.7;color:${TEXT};margin:0 0 8px;">For a WhatsApp or phone call, we'll call the number you gave us. For a video call, we'll email the link before the session.</p>
    <p style="font-size:13px;line-height:1.7;color:${MUTED};margin:14px 0 0;">Can't make it? <a href="${escapeHtml(cancelUrl)}" style="color:${NAVY};font-weight:600;">Cancel this booking</a> and book another time, or reply to this email.</p>`;
  return shell(inner, { preheader: `${d.typeLabel}: ${d.whenText}` });
}

export function bookingAdminEmail({ fullName, email, phone, caseUrl, paid, ...d }) {
  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:18px;margin:0 0 6px;">New consultation booking${paid ? ' (paid: confirm the exact fee with the client)' : ''}</h2>
    ${bookingDetailsHtml(d)}
    <p style="font-size:13.5px;line-height:1.7;color:${TEXT};margin:0;"><strong>${escapeHtml(fullName)}</strong><br>${escapeHtml(email)}${phone ? `<br>${escapeHtml(phone)}` : ''}</p>
    ${caseUrl ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(caseUrl)}" style="color:${NAVY};font-weight:700;">Open in dashboard →</a></p>` : ''}`;
  return shell(inner, { preheader: `${fullName}: ${d.whenText}` });
}

export function bookingReminderEmail({ fullName, cancelUrl, ...d }) {
  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:20px;margin:0 0 12px;">Reminder: your consultation is tomorrow</h2>
    <p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 8px;">Dear ${escapeHtml(fullName || 'valued client')}, this is a reminder of your consultation with Awal Global Consults.</p>
    ${bookingDetailsHtml(d)}
    <p style="font-size:13px;line-height:1.7;color:${MUTED};margin:14px 0 0;">Can't make it? <a href="${escapeHtml(cancelUrl)}" style="color:${NAVY};font-weight:600;">Cancel this booking</a> or reply to this email.</p>`;
  return shell(inner, { preheader: `Tomorrow: ${d.whenText}` });
}
