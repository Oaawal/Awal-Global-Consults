import { WHATSAPP_LINK, BANK_DETAILS } from './brevo.js';

const NAVY = '#0b1f3a';
const GOLD = '#c9973a';
const GOLD_PALE = '#f9f0dc';
const BG = '#faf9f6';
const BORDER = '#e0ddd6';
const TEXT = '#1a1a1a';
const MUTED = '#666666';

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

function serviceListHtml(services) {
  if (!services || services.length === 0) return '';
  return `<div style="background:${BG};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;margin:16px 0;">
    ${services.map(s => `<div style="padding:4px 0;font-size:13px;color:${TEXT};"><span style="color:${GOLD};font-weight:700;">✓</span> ${escapeHtml(s)}</div>`).join('')}
  </div>`;
}

function paymentBlockHtml() {
  return `
    <div style="margin:18px 0;padding:16px;background:${GOLD_PALE};border-radius:8px;border-left:3px solid ${GOLD};">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#5a3e00;margin-bottom:8px;">Payment Details</div>
      <div style="font-size:13px;line-height:1.7;color:${TEXT};">
        <strong>${escapeHtml(BANK_DETAILS.accountName)}</strong><br>
        ${escapeHtml(BANK_DETAILS.bank)} — Account Number: <strong>${escapeHtml(BANK_DETAILS.accountNumber)}</strong><br>
        Or pay online: <a href="${BANK_DETAILS.paystackLink}" style="color:${NAVY};font-weight:600;">${BANK_DETAILS.paystackLink}</a>
      </div>
      <div style="font-size:11.5px;color:${MUTED};margin-top:8px;">After payment, please send proof of payment on WhatsApp with your full name so we can begin processing.</div>
    </div>`;
}

// ── KYC: client confirmation email ──────────────────────────────
export function kycClientEmail({ fullName, services, hasFixedPrice, resumeId }) {
  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:20px;margin:0 0 12px;">Thank you, ${escapeHtml(fullName || 'valued client')}</h2>
    <p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 8px;">
      We've received your client intake and KYC submission. Our team will review your details and contact you within
      <strong>1 working day</strong> to confirm receipt and advise on next steps.
    </p>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${GOLD};margin-top:20px;">Services Requested</div>
    ${serviceListHtml(services)}
    ${hasFixedPrice ? paymentBlockHtml() : `<div style="margin:16px 0;padding:14px 16px;background:${BG};border-left:3px solid ${NAVY};border-radius:0 8px 8px 0;font-size:13px;color:${NAVY};">Your selection includes one or more services that require a custom quote. We'll follow up with pricing shortly — no payment is needed yet.</div>`}
    ${resumeId ? `<div style="font-size:12px;color:${MUTED};margin-top:12px;">Resume reference: <strong style="color:${NAVY};">${escapeHtml(resumeId)}</strong></div>` : ''}
    <div style="margin-top:22px;padding-top:18px;border-top:1px solid ${BORDER};font-size:13px;color:${TEXT};">
      Questions in the meantime? Chat with us directly on <a href="${WHATSAPP_LINK}" style="color:${NAVY};font-weight:600;">WhatsApp</a>.
    </div>`;
  return shell(inner, { preheader: 'We\'ve received your KYC submission — here\'s what happens next.' });
}

// ── KYC: admin notification email ───────────────────────────────
export function kycAdminEmail({ fields, services, estimatedTotal, resumeId, attachmentsNote }) {
  const rows = Object.entries(fields)
    .filter(([, v]) => v !== '' && v !== undefined && v !== null)
    .map(([k, v]) => `<tr><td style="padding:6px 10px;border-bottom:1px solid ${BORDER};font-size:12px;color:${MUTED};white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:6px 10px;border-bottom:1px solid ${BORDER};font-size:12.5px;color:${TEXT};">${escapeHtml(v)}</td></tr>`)
    .join('');

  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:18px;margin:0 0 6px;">New KYC Submission</h2>
    <div style="font-size:12.5px;color:${MUTED};margin-bottom:14px;">${resumeId ? `Resume ID: <strong style="color:${NAVY};">${escapeHtml(resumeId)}</strong>` : 'New application'}</div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${GOLD};margin-top:10px;">Services Requested</div>
    ${serviceListHtml(services)}
    <div style="font-size:13px;font-weight:700;color:${NAVY};margin:10px 0;">Estimated Total: ${escapeHtml(estimatedTotal || 'To be quoted')}</div>
    ${attachmentsNote ? `<div style="font-size:12px;color:#a05a00;background:${GOLD_PALE};border-radius:6px;padding:8px 12px;margin-bottom:12px;">${escapeHtml(attachmentsNote)}</div>` : ''}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${GOLD};margin-top:16px;margin-bottom:8px;">Submitted Details</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`;
  return shell(inner, { preheader: 'New client KYC submission received.' });
}

// ── Contact form: client acknowledgement email ──────────────────
export function contactClientEmail({ fullName, service }) {
  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:20px;margin:0 0 12px;">Thank you, ${escapeHtml(fullName || 'there')}</h2>
    <p style="font-size:14px;line-height:1.7;color:${TEXT};margin:0 0 8px;">
      We've received your enquiry${service ? ` about <strong>${escapeHtml(service)}</strong>` : ''}. A member of our team will
      review it and get back to you shortly.
    </p>
    <div style="margin-top:20px;padding-top:18px;border-top:1px solid ${BORDER};font-size:13px;color:${TEXT};">
      Need a faster response? Chat with us directly on <a href="${WHATSAPP_LINK}" style="color:${NAVY};font-weight:600;">WhatsApp</a>.
    </div>`;
  return shell(inner, { preheader: 'We\'ve received your enquiry — a consultant will be in touch shortly.' });
}

// ── Contact form: admin notification email ──────────────────────
export function contactAdminEmail({ fields, service }) {
  const rows = Object.entries(fields)
    .filter(([, v]) => v !== '' && v !== undefined && v !== null)
    .map(([k, v]) => `<tr><td style="padding:6px 10px;border-bottom:1px solid ${BORDER};font-size:12px;color:${MUTED};white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:6px 10px;border-bottom:1px solid ${BORDER};font-size:12.5px;color:${TEXT};">${escapeHtml(v)}</td></tr>`)
    .join('');

  const inner = `
    <h2 style="font-family:Georgia,'Fraunces',serif;color:${NAVY};font-size:18px;margin:0 0 6px;">New Enquiry${service ? ` — ${escapeHtml(service)}` : ''}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10px;">${rows}</table>`;
  return shell(inner, { preheader: `New website enquiry${service ? ` — ${service}` : ''}.` });
}
