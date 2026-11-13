/**
 * Filing pack: everything an agency portal asks for, taken from a case and laid out in the
 * order the work is done (name and business details, then each person, then documents),
 * with portal-ready file names and a checklist of what is still missing.
 *
 * Used by the dashboard's Filing tab and by the browser extension (as JSON). Field `key`s
 * are stable: the extension remembers which portal box each key went into.
 */
import { DOC_REQUIREMENTS, reqKey, missingForCase } from './requirements.js';
import { agencyOf } from './service-progress.js';

const REG = ['Business Name Registration', 'Limited Company Registration', 'Incorporated Trustees / NGO'];

// Form fields that are about the request, not the filing
const SKIP = /^(intake|declaration accurate|declaration consent|found us via|heard about us|services requested|people count|subject|estimated amount|additional notes|case id|case key)$/i;

const BUSINESS = [
  ['name1', 'Proposed Name 1', 'Proposed name (1st choice)'],
  ['name2', 'Proposed Name 2', 'Proposed name (2nd choice)'],
  ['name3', 'Proposed Name 3', 'Proposed name (3rd choice)'],
  ['business_name', 'Business Name', 'Registered business / company name'],
  ['reg_number', 'Existing Registration Number', 'RC / BN number'],
  ['company_type', 'Company Type', 'Company type'],
  ['category', 'Business Category', 'Nature of business category'],
  ['nature', 'Specific Nature Of Business', 'Specific nature of business'],
  ['objects', 'Other Objects', 'Other objects (one per line)'],
  ['aims', 'Aims And Objectives', 'Aims and objectives'],
  ['description', 'Business Description', 'Business description'],
  ['address', 'Business Address', 'Business address'],
  ['share_capital', 'Share Capital', 'Share capital (₦)']
];
const CONTACT = [
  ['contact_name', 'Full Name', 'Contact person'],
  ['contact_email', 'Email', 'Email'],
  ['contact_phone', 'Phone', 'Phone'],
  ['state', 'State', 'State']
];
const PERSON = [
  ['role', 'Role'], ['full_name', 'Full Name'], ['gender', 'Gender'], ['dob', 'Date of Birth'],
  ['nationality', 'Nationality'], ['nin', 'NIN'], ['passport', 'Passport Number'], ['phone', 'Phone'],
  ['email', 'Email'], ['occupation', 'Occupation'], ['address', 'Residential Address'], ['share_pct', 'Shareholding Percent']
];

function parseFields(c) {
  try { return JSON.parse(c.form_data || '{}') || {}; } catch (e) { return {}; }
}
const clean = v => String(v == null ? '' : v).trim();
const field = (key, label, value, hint) => ({ key, label, value: clean(value), ...(hint ? { hint } : {}) });

/** 1990-01-31 → 31/01/1990 (most portals use day first) */
export function dayFirst(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : clean(iso);
}
/** Naira amount from text like "1,000,000" or "₦1m" (plain digits only; anything else → null) */
function nairaNumber(text) {
  const t = clean(text).replace(/[₦,\s]/g, '').toLowerCase();
  const m = /^(\d+(?:\.\d+)?)(m|k)?$/.exec(t);
  if (!m) return null;
  return Math.round(Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1));
}
/** Split "Ada Ngozi Obi" into first / other / surname. The order people type varies, so this is marked "check". */
function splitName(full) {
  const p = clean(full).split(/\s+/).filter(Boolean);
  if (p.length < 2) return { first: p[0] || '', other: '', surname: '' };
  return { first: p[0], other: p.slice(1, -1).join(' '), surname: p[p.length - 1] };
}

function people(f, shareCapital) {
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const get = k => clean(f[`Person ${i} ${k}`]);
    if (!get('Full Name')) { if (i > 1 && !get('Role')) break; else continue; }
    const name = splitName(get('Full Name'));
    const fields = [
      field('role', 'Role', get('Role')),
      field('surname', 'Surname', name.surname, 'Split from the full name: check the order'),
      field('first_name', 'First name', name.first),
      field('other_names', 'Other names', name.other),
      field('full_name', 'Full name', get('Full Name')),
      field('gender', 'Gender', get('Gender')),
      field('dob', 'Date of birth (DD/MM/YYYY)', dayFirst(get('Date of Birth'))),
      field('dob_iso', 'Date of birth (YYYY-MM-DD)', get('Date of Birth')),
      field('nationality', 'Nationality', get('Nationality')),
      field('nin', 'NIN', get('NIN')),
      field('passport', 'Passport number', get('Passport Number')),
      field('phone', 'Phone', get('Phone')),
      field('email', 'Email', get('Email')),
      field('occupation', 'Occupation', get('Occupation')),
      field('address', 'Residential address', get('Residential Address'))
    ];
    const pct = Number(get('Shareholding Percent').replace('%', ''));
    if (pct) {
      fields.push(field('share_pct', 'Shareholding (%)', String(pct)));
      if (shareCapital) fields.push(field('shares', 'Number of shares (at ₦1 each)', Math.round(shareCapital * pct / 100).toLocaleString('en-NG')));
    }
    out.push({ index: i, name: get('Full Name'), role: get('Role'), fields: fields.filter(x => x.value) });
  }
  return out;
}

// Short, portal-friendly labels for each kind of document
const DOC_SHORT = [
  [/passport photo/i, 'Passport-Photo'], [/valid id|nin slip|data page/i, 'ID'], [/cac certificate|business name certificate/i, 'CAC-Certificate'],
  [/memart/i, 'MEMART'], [/status report/i, 'Status-Report'], [/tin certificate/i, 'TIN-Certificate'], [/utility|proof of .*address/i, 'Proof-of-Address'],
  [/privacy policy/i, 'Privacy-Policy'], [/constitution/i, 'Constitution'], [/employment letter|contract/i, 'Employment-Letter'],
  [/tax payment|receipt/i, 'Tax-Receipt'], [/employee list/i, 'Employee-List'], [/lga/i, 'LGA-Certificate']
];
const REQ_BY_KEY = (() => {
  const m = new Map();
  for (const list of Object.values(DOC_REQUIREMENTS)) for (const label of list) m.set(reqKey(label), label);
  return m;
})();
const slugWords = s => clean(s).replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** Portal-ready name and what each uploaded document is */
export function describeDocuments(c, docs) {
  const counts = {};
  return docs.map(d => {
    const ext = (/\.([a-z0-9]+)$/i.exec(d.file_name) || [, 'pdf'])[1].toLowerCase().replace('jpeg', 'jpg');
    let what = '', short = '';
    const sig = /^signature-(\d+)-(.+)\.[a-z]+$/i.exec(d.file_name);
    const lga = /^lga-certificate-/i.test(d.file_name);
    const req = /^([a-z0-9-]+)--(.+)$/.exec(d.file_name);
    if (sig) { what = `Signature of person ${sig[1]}`; short = `Signature-${slugWords(sig[2]).replace(/(^|-)([a-z])/g, (m, a, b) => a + b.toUpperCase())}`; }
    else if (lga) { what = 'LGA certificate'; short = 'LGA-Certificate'; }
    else if (req && REQ_BY_KEY.has(req[1])) {
      what = REQ_BY_KEY.get(req[1]);
      short = (DOC_SHORT.find(([re]) => re.test(what)) || [, slugWords(what)])[1];
    } else { what = 'Other document'; short = slugWords(req ? req[2] : d.file_name) || 'Document'; }
    counts[short] = (counts[short] || 0) + 1;
    return { id: d.id, file_name: d.file_name, size_bytes: d.size_bytes, what, short, ext };
  }).map((d, i, all) => {
    const many = all.filter(x => x.short === d.short).length > 1;
    const n = all.slice(0, i + 1).filter(x => x.short === d.short).length;
    return { ...d, portal_name: `${c.reference}-${d.short}${many ? `-${n}` : ''}.${d.ext}` };
  });
}

/**
 * @returns {{ reference, client, services:[{service, agency}], sections:[{title, fields}], people, documents, missing, extra }}
 */
export function filingPack(c, docs) {
  const f = parseFields(c);
  const used = new Set();
  const take = (formKey) => { used.add(formKey); return f[formKey]; };

  const services = clean(c.services).split(',').map(s => s.trim()).filter(Boolean);
  const isReg = services.some(s => REG.includes(s));
  const shareCapital = nairaNumber(f['Share Capital']);

  const business = BUSINESS.map(([key, formKey, label]) => field(key, label, take(formKey))).filter(x => x.value);
  if (shareCapital) business.push(field('share_capital_number', 'Share capital (digits only)', String(shareCapital)));
  const contact = CONTACT.map(([key, formKey, label]) => field(key, label, take(formKey) || (key === 'contact_name' ? c.full_name : key === 'contact_email' ? c.email : key === 'contact_phone' ? c.phone : ''))).filter(x => x.value);

  const ppl = people(f, shareCapital);
  for (const k of Object.keys(f)) if (/^Person \d+ /.test(k)) used.add(k);

  const passport = Object.entries(f).filter(([k]) => /^Passport /.test(k)).map(([k, v]) => {
    used.add(k);
    const label = k.replace(/^Passport /, '').replace(/_/g, ' ');
    const value = /date/i.test(label) ? dayFirst(v) : v;
    return field(`passport_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, label, value);
  }).filter(x => x.value);

  const extra = Object.entries(f).filter(([k, v]) => !used.has(k) && !SKIP.test(k) && clean(v))
    .map(([k, v]) => field(`extra_${k.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, k, v));

  const sections = [];
  if (business.length) sections.push({ id: 'business', title: isReg ? 'Name reservation and business details' : 'Business details', fields: business });
  if (contact.length) sections.push({ id: 'contact', title: 'Contact', fields: contact });
  if (passport.length) sections.push({ id: 'passport', title: 'Passport application', fields: passport });
  if (extra.length) sections.push({ id: 'other', title: 'Other details from the form', fields: extra });

  // Documents we produced for the client (certificates...) are not filing material
  docs = docs.filter(d => !/^delivered-/.test(d.file_name));
  const documents = describeDocuments(c, docs);
  const missing = missingForCase(c, docs);
  return {
    reference: c.reference,
    client: { name: c.full_name, email: c.email || '', phone: c.phone || '' },
    services: services.map(s => ({ service: s, agency: agencyOf(s) })),
    sections,
    people: ppl,
    documents,
    missing
  };
}
