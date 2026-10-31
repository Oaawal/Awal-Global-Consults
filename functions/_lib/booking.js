/**
 * Consultation booking: types, opening hours and slot maths.
 * Times are worked out in Lagos time (UTC+1, no daylight saving) and stored in UTC.
 *
 * To change what is free or paid, the fee, or the hours, edit the constants below.
 */

export const LAGOS_OFFSET_HOURS = 1;
export const SLOT_MINUTES = 30;
export const DAYS_AHEAD = 21;
export const MIN_NOTICE_HOURS = 18;

// Lagos opening hours for consultations, by weekday (0 = Sunday). [startHour, endHour)
export const HOURS = {
  1: [10, 16], 2: [10, 16], 3: [10, 16], 4: [10, 16], 5: [10, 16],
  6: [10, 13]
};

// Paid consultations start from this fee; the exact fee depends on the scope and is confirmed by email.
export const PAID_FEE_FROM_NGN = 20000;

// Where clients pay for paid consultations (bank transfer)
export const PAYMENT_BANK = {
  bank: 'Kuda Bank',
  accountName: 'AWAL GLOBAL CONSULTS LIMITED',
  accountNumber: '3003466189'
};

export const CONSULT_TYPES = {
  'free-registration': {
    label: 'Free 20-minute call: registration and compliance',
    short: 'Free registration call',
    minutes: 20,
    paid: false,
    covers: 'CAC registration (business name, company, incorporated trustees), trademarks, annual returns, TIN, SCUML, NEPC export licence and other licences'
  },
  'free-identity': {
    label: 'Free 20-minute call: passport, NIN and identity',
    short: 'Free identity call',
    minutes: 20,
    paid: false,
    covers: 'Passport applications and renewals, NIN enrolment and corrections, including from abroad'
  },
  'paid-advisory': {
    label: 'Paid 45-minute consultation: legal and advisory',
    short: 'Paid advisory consultation',
    minutes: 45,
    paid: true,
    covers: 'Property document checks, contracts and legal documentation, business structuring and tax planning, foreign investment, expatriate quota and CERPAC, student visa strategy'
  }
};

export const MODES = {
  whatsapp: 'WhatsApp call',
  phone: 'Phone call',
  video: 'Video call (we send a link)'
};

const DAY_MS = 86400000;

/** Lagos calendar date (YYYY-MM-DD) and weekday for a UTC instant. */
function lagosParts(date) {
  const l = new Date(date.getTime() + LAGOS_OFFSET_HOURS * 3600000);
  return { ymd: l.toISOString().slice(0, 10), weekday: l.getUTCDay() };
}

/** UTC instant for a Lagos date and hour/minute. */
export function lagosToUtc(ymd, hour, minute) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - LAGOS_OFFSET_HOURS, minute));
}

/** Every bookable slot start (UTC ISO) in the window, ignoring existing bookings. */
export function candidateSlots(now = new Date()) {
  const earliest = now.getTime() + MIN_NOTICE_HOURS * 3600000;
  const slots = [];
  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const { ymd, weekday } = lagosParts(new Date(now.getTime() + i * DAY_MS));
    const hours = HOURS[weekday];
    if (!hours) continue;
    for (let mins = hours[0] * 60; mins < hours[1] * 60; mins += SLOT_MINUTES) {
      const start = lagosToUtc(ymd, Math.floor(mins / 60), mins % 60);
      if (start.getTime() >= earliest) slots.push(start.toISOString());
    }
  }
  return slots;
}

/** Slots a consultation of this type can use: a 45-minute session needs two free slots in a row. */
export function slotsNeeded(type) {
  return Math.ceil(CONSULT_TYPES[type].minutes / SLOT_MINUTES);
}

export function blockedSlots(startIso, type) {
  const n = slotsNeeded(type);
  const start = new Date(startIso).getTime();
  return Array.from({ length: n }, (_, i) => new Date(start + i * SLOT_MINUTES * 60000).toISOString());
}

/** Free slot starts for a type, grouped by Lagos date. */
export function availableSlots(type, takenSet, now = new Date()) {
  const all = candidateSlots(now);
  const allSet = new Set(all);
  const days = {};
  for (const iso of all) {
    const needed = blockedSlots(iso, type);
    if (!needed.every(s => allSet.has(s) && !takenSet.has(s))) continue;
    const { ymd } = lagosParts(new Date(iso));
    (days[ymd] = days[ymd] || []).push(iso);
  }
  return days;
}

export function fmtLagos(iso, opts = {}) {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long',
    hour: 'numeric', minute: '2-digit', hour12: true, ...opts
  });
}

export function feeText(type) {
  if (!CONSULT_TYPES[type].paid) return 'Free';
  return `From ₦${PAID_FEE_FROM_NGN.toLocaleString('en-NG')}, depending on scope`;
}

/** Taken slot starts (every 30-minute block a live booking occupies), from the bookings table. */
export async function takenSlots(env, now = new Date()) {
  const from = new Date(now.getTime() - DAY_MS).toISOString();
  const rows = (await env.DB.prepare(
    "SELECT slot_start, type FROM bookings WHERE status != 'cancelled' AND slot_start >= ?1"
  ).bind(from).all()).results || [];
  const set = new Set();
  for (const r of rows) for (const s of blockedSlots(r.slot_start, CONSULT_TYPES[r.type] ? r.type : 'paid-advisory')) set.add(s);
  return set;
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
