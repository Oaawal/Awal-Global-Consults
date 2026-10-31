/**
 * Case stages, client update messages, and the retention rules applied when
 * a case changes status. Used by the admin dashboard (/admin).
 */

// Stages for applications, in pipeline order. `client` is the line used in the
// update email to the client; `notify` is whether the "email the client" box
// starts ticked.
export const APPLICATION_STATUSES = [
  { key: 'new', label: 'New', notify: false, client: 'We have received your application and will review it shortly.' },
  { key: 'quote_sent', label: 'Quote sent', notify: true, client: 'We have sent you a quote for your request. Please review it and let us know if you have any questions.' },
  { key: 'awaiting_documents', label: 'Awaiting documents', notify: true, client: 'We need some more documents or information from you before we can continue. Please send them on WhatsApp or reply to this email.' },
  { key: 'paid', label: 'Payment received', notify: true, client: 'We have received your payment, thank you. We are now preparing your filing.' },
  { key: 'filed', label: 'Filed with agency', notify: true, client: 'Your application has been filed with the relevant agency. We will update you as soon as we hear back.' },
  { key: 'approved', label: 'Approved', notify: true, client: 'Good news: your application has been approved. We are preparing your documents for delivery.' },
  { key: 'delivered', label: 'Delivered', notify: true, client: 'Your documents have been delivered. Thank you for choosing Awal Global Consults.' },
  { key: 'closed', label: 'Closed', notify: false, client: 'Your case is now closed. Thank you for choosing Awal Global Consults.' },
  { key: 'cancelled', label: 'Cancelled', notify: false, client: 'Your request has been cancelled. If this is unexpected, please contact us.' }
];

export const ENQUIRY_STATUSES = [
  { key: 'new', label: 'New', notify: false, client: '' },
  { key: 'contacted', label: 'Contacted', notify: false, client: 'Thank you for your enquiry. We have been in touch about your request.' },
  { key: 'converted', label: 'Became an application', notify: false, client: '' },
  { key: 'closed', label: 'Closed', notify: false, client: '' }
];

// Statuses that end a case and start its retention clock
const FINAL_STATUSES = new Set(['closed', 'cancelled', 'converted']);

const APPLICATION_RETENTION_YEARS = 6; // covers the 5-year AML minimum and 6-year CAMA/CITA period
const NON_ENGAGEMENT_RETENTION_MONTHS = 12; // enquiries and cancelled applications

export function statusesFor(kind) {
  return kind === 'enquiry' ? ENQUIRY_STATUSES : APPLICATION_STATUSES;
}

export function statusInfo(kind, key) {
  return statusesFor(kind).find(s => s.key === key) || { key, label: key, notify: false, client: '' };
}

export function isOpen(status) {
  return !FINAL_STATUSES.has(status);
}

function addMonths(iso, months) {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

/**
 * Retention fields for a case moving to `status` at time `now`.
 * - Application closed: kept 6 years from closing.
 * - Application cancelled (never engaged) and enquiries: 12 months from the last activity.
 * - Application reopened: retention clock cleared until it closes again.
 */
export function retentionFor(kind, status, now) {
  const final = FINAL_STATUSES.has(status);
  if (kind === 'enquiry') {
    return { closedAt: final ? now : null, retainUntil: addMonths(now, NON_ENGAGEMENT_RETENTION_MONTHS) };
  }
  if (status === 'closed') return { closedAt: now, retainUntil: addMonths(now, APPLICATION_RETENTION_YEARS * 12) };
  if (status === 'cancelled') return { closedAt: now, retainUntil: addMonths(now, NON_ENGAGEMENT_RETENTION_MONTHS) };
  return { closedAt: null, retainUntil: null };
}

/** WhatsApp chat link for a Nigerian or international phone number, or null. */
export function whatsappLink(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('0')) digits = '234' + digits.slice(1);
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

/** Safe content type for serving a stored document, decided by file extension only. */
export function documentContentType(fileName) {
  const ext = (/\.([a-z0-9]+)$/i.exec(String(fileName || '')) || [])[1];
  switch ((ext || '').toLowerCase()) {
    case 'pdf': return 'application/pdf';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    default: return 'application/octet-stream';
  }
}

/** Public site address used in links inside emails. */
export const SITE_URL = 'https://awalglobal.com.ng';

/**
 * A follow-up reminder for you, set automatically when a case is delivered,
 * for services that bring repeat work. Returns null when none applies.
 * The note says what to check, since exact due dates depend on the entity.
 */
export function autoFollowUp(services, status, now) {
  if (status !== 'delivered') return null;
  const s = String(services || '');
  if (/cerpac|expatriate|residence permit/i.test(s)) {
    return { at: addMonths(now, 11), note: 'CERPAC renewal coming up: offer to handle the renewal.' };
  }
  if (/cac|business name|company|incorporat|trustee|annual return/i.test(s)) {
    return {
      at: addMonths(now, 11),
      note: 'CAC annual returns coming up (business names yearly; a company\'s first return is due 18 months after incorporation): offer to file.'
    };
  }
  return null;
}

// The usual next stage, offered as the one-tap action on a case
const NEXT_STATUS = {
  application: { new: 'quote_sent', quote_sent: 'paid', awaiting_documents: 'filed', paid: 'filed', filed: 'approved', approved: 'delivered', delivered: 'closed' },
  enquiry: { new: 'contacted', contacted: 'closed' }
};

export function nextStatus(kind, status) {
  return (NEXT_STATUS[kind] || {})[status] || null;
}

/** Stages to draw in a progress tracker: the main path, plus a side stage while it is current. */
export function progressPath(kind, status) {
  return statusesFor(kind).filter(s =>
    s.key === status || !['closed', 'cancelled', 'converted', 'awaiting_documents'].includes(s.key));
}
