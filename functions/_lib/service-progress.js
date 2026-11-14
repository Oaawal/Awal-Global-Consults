/**
 * Progress of each service on a case, in the order the work has to happen.
 *
 * A case can hold several services that depend on each other (a company registration, then
 * its TIN, then SCUML). The case status says where the case as a whole is; this says where
 * each service is, which agency has it, and what it is waiting for.
 *
 * Each update is a case_events row: event 'service_progress', from_status = the service,
 * to_status = the step, note = what was said. The latest row per service is its current step,
 * so the history is kept and no extra table is needed.
 */

const REG = ['Business Name Registration', 'Limited Company Registration', 'Incorporated Trustees / NGO'];
const TIN = 'TIN Registration & Validation';

/** Who handles each service. */
export const AGENCY = {
  'Business Name Registration': 'CAC', 'Limited Company Registration': 'CAC', 'Incorporated Trustees / NGO': 'CAC',
  'Business Name Renewal': 'CAC', 'Post-Incorporation Changes & Compliance': 'CAC',
  'TIN Registration & Validation': 'NRS', 'Tax Clearance & VAT Filing': 'NRS', 'Payroll Processing': 'the state tax authority',
  'SCUML Registration': 'SCUML', 'Business Permits & Regulatory Licensing': 'the regulator', 'Expatriate Quota / CERPAC': 'the Ministry of Interior',
  'NDPC Registration (Data Controller / Processor)': 'the NDPC', 'NDPC Compliance Audit Return': 'the NDPC', 'DPCO Licence Application': 'the NDPC',
  'Intellectual Property Registration': 'the Trademarks Registry', 'International Passport (E-passport)': 'the Immigration Service',
  'NIN Registration & Correction': 'NIMC', 'Export / Import Licensing': 'NEPC', 'Student Visa & Relocation': 'the embassy'
};

/** What must be finished first, when it is on the same case. */
const NEEDS = {
  'TIN Registration & Validation': REG,
  'SCUML Registration': [...REG, TIN],
  'Tax Clearance & VAT Filing': [...REG, TIN],
  'Payroll Processing': [...REG, TIN],
  'Business Permits & Regulatory Licensing': [...REG, TIN],
  'Export / Import Licensing': [...REG, TIN],
  'Expatriate Quota / CERPAC': [...REG, TIN],
  'NDPC Registration (Data Controller / Processor)': REG,
  'NDPC Compliance Audit Return': [...REG, 'NDPC Registration (Data Controller / Processor)'],
  'DPCO Licence Application': [...REG, TIN, 'Tax Clearance & VAT Filing'],
  'Post-Incorporation Changes & Compliance': REG,
  'Fintech & Startup Compliance': REG
};

/** The steps, in order. {agency} is filled in per service. */
export const STEPS = [
  { key: 'not_started', label: 'Not started' },
  { key: 'waiting_client', label: 'Waiting on client', client: 'We need something from you before we can continue with this service. We will be in touch, or you can reply to this email.' },
  { key: 'preparing', label: 'Preparing', client: 'We are preparing your application.' },
  { key: 'submitted', label: 'Submitted to {agency}', client: 'Your application has been submitted to {agency}. We will update you as soon as they respond.' },
  { key: 'query', label: 'Query from {agency}', client: '{agency} has raised a query on your application. We are handling it and will let you know if we need anything from you.' },
  { key: 'approved', label: 'Approved', client: 'Good news: {agency} has approved your application.' },
  { key: 'delivered', label: 'Delivered', client: 'Your documents for this service have been delivered to you.' },
  { key: 'not_needed', label: 'Not needed' }
];
const DONE = new Set(['approved', 'delivered', 'not_needed']);
const fill = (text, agency) => String(text || '').replace(/\{agency\}/g, agency);

export const agencyOf = service => AGENCY[service] || 'the agency';
export function stepInfo(service, key) {
  const s = STEPS.find(x => x.key === key) || STEPS[0];
  const agency = agencyOf(service);
  return { key: s.key, label: fill(s.label, agency), client: s.client ? fill(s.client, agency.replace(/^the /, 'The ')) : '' };
}
export const isStep = key => STEPS.some(s => s.key === key);

/**
 * Current progress of every service on a case, ordered so prerequisites come first.
 * @param {string} servicesText the case's comma-separated services
 * @param {Array} events the case's events (any order)
 */
export function serviceProgress(servicesText, events) {
  const services = String(servicesText || '').split(',').map(s => s.trim()).filter(Boolean);
  const latest = new Map(), refs = new Map();
  const ordered_ = [...(events || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const e of ordered_) {
    if (e.event === 'service_progress') latest.set(e.from_status, e);
    if (e.event === 'service_ref') refs.set(e.from_status, e.to_status);
  }
  // Order: anything a service needs comes before it (stable otherwise)
  const ordered = [], seen = new Set();
  const visit = s => { if (seen.has(s)) return; seen.add(s); for (const d of NEEDS[s] || []) if (services.includes(d)) visit(d); ordered.push(s); };
  services.forEach(visit);
  const rows = ordered.map(service => {
    const ev = latest.get(service);
    const step = stepInfo(service, ev ? ev.to_status : 'not_started');
    return { service, agency: agencyOf(service), step: step.key, label: step.label, note: ev ? ev.note : '', at: ev ? ev.created_at : null, reference: refs.get(service) || '' };
  });
  const byName = new Map(rows.map(r => [r.service, r]));
  for (const r of rows) {
    r.waitingFor = (NEEDS[r.service] || []).filter(d => byName.has(d) && !DONE.has(byName.get(d).step));
    r.done = DONE.has(r.step);
  }
  return rows;
}

/**
 * How long an application can sit with each agency before it is worth chasing (days).
 * Used by the morning summary to list services "submitted" or "queried" for longer than this.
 */
const CHASE_AFTER = { CAC: 5, NRS: 7, SCUML: 7, 'the NDPC': 14, 'the Trademarks Registry': 30 };
export const chaseAfterDays = agency => CHASE_AFTER[agency] || 14;

/** Services waiting on an agency for longer than usual: [{ service, agency, label, days, reference }] */
export function overdueAtAgency(rows, now = new Date()) {
  return rows.filter(r => ['submitted', 'query'].includes(r.step) && r.at)
    .map(r => ({ ...r, days: Math.floor((now - new Date(r.at)) / 86400000) }))
    .filter(r => r.days >= chaseAfterDays(r.agency));
}
