/**
 * Shared Brevo (Sendinblue) transactional email helper.
 * Used by /functions/submit-kyc.js and /functions/submit-contact.js.
 *
 * Requires a Cloudflare Pages environment variable named BREVO_API_KEY,
 * set in the Cloudflare dashboard (Pages project → Settings → Environment variables).
 * NEVER hardcode the key here or anywhere in the repo.
 */

const SENDER = { name: 'Awal Global Consults', email: 'noreply@awalglobal.com.ng' };

/**
 * Send a single transactional email via the Brevo API.
 * @param {object} env - Cloudflare Pages env bindings (must contain BREVO_API_KEY)
 * @param {object} opts
 * @param {{email:string,name?:string}} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {{email:string,name?:string}} [opts.replyTo]
 * @param {Array<{name:string, content:string}>} [opts.attachments] - content must be base64 (no data: prefix)
 */
export async function sendBrevoEmail(env, { to, subject, html, replyTo, attachments }) {
  if (!env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY is not configured in this environment');
  }

  const body = {
    sender: SENDER,
    to: [to],
    subject,
    htmlContent: html
  };

  if (replyTo) body.replyTo = replyTo;
  if (attachments && attachments.length > 0) body.attachment = attachments;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json',
      'accept': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Brevo API error (${res.status}): ${errText}`);
  }

  return res.json();
}

/**
 * Convert a File (from FormData) to a base64 string, capped at maxBytes.
 * Returns null if the file is missing, empty, or exceeds maxBytes.
 */
export async function fileToBase64(file, maxBytes) {
  if (!file || typeof file.arrayBuffer !== 'function' || file.size === 0) return null;
  if (maxBytes && file.size > maxBytes) return null;
  const buf = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export const WHATSAPP_LINK = 'https://wa.me/2347038336596';
export const BANK_DETAILS = {
  bank: 'KudaBank',
  accountName: 'Awal Global Consults Limited',
  accountNumber: '3003466189',
  paystackLink: 'https://paystack.shop/pay/awalglobal'
};
