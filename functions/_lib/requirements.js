/**
 * What each service needs, used by the dashboard to list missing information and documents.
 * DOC_REQUIREMENTS must match the upload boxes on the application form (kyc/index.html);
 * uploaded files are named "<requirement-slug>--<original name>".
 */

export const DOC_REQUIREMENTS = {
 "Business Name Registration": [
  "Valid ID of each proprietor (NIN slip, national ID, international passport or driver's licence)",
  "Passport photograph of each proprietor"
 ],
 "Limited Company Registration": [
  "Valid ID of each director and shareholder",
  "Passport photograph of each director and shareholder"
 ],
 "Incorporated Trustees / NGO": [
  "Valid ID of each trustee",
  "Passport photograph of each trustee",
  "Constitution of the organisation, if drafted"
 ],
 "Business Name Renewal": [
  "Business name certificate",
  "Valid ID of the proprietor"
 ],
 "Post-Incorporation Changes & Compliance": [
  "CAC certificate",
  "Status report or CAC documents",
  "Valid ID of any new director, shareholder or secretary"
 ],
 "TIN Registration & Validation": [
  "NIN slip or valid ID",
  "CAC certificate, if registered"
 ],
 "Tax Clearance & VAT Filing": [
  "CAC certificate",
  "TIN certificate",
  "Recent tax payment receipts"
 ],
 "Payroll Processing": [
  "Employee list with salaries"
 ],
 "SCUML Registration": [
  "CAC certificate",
  "Valid ID of each director or proprietor",
  "Proof of business address (utility bill)"
 ],
 "Business Permits & Regulatory Licensing": [
  "CAC certificate",
  "TIN certificate",
  "MEMART"
 ],
 "Expatriate Quota / CERPAC": [
  "CAC certificate",
  "Expatriate's passport data page",
  "Employment letter or contract"
 ],
 "NDPC Registration (Data Controller / Processor)": [
  "CAC certificate",
  "Current privacy policy"
 ],
 "NDPC Compliance Audit Return": [
  "NDPC registration certificate",
  "Privacy notice and data protection policy"
 ],
 "DPCO Licence Application": [
  "CAC certificate",
  "Tax clearance certificate",
  "Staff qualifications or certificates",
  "Valid ID of one director"
 ],
 "Intellectual Property Registration": [
  "Logo or sample of the work",
  "Valid ID of the applicant"
 ],
 "Legal Advisory": [
  "Any related documents"
 ],
 "Legal Documentation": [
  "Any existing related documents"
 ],
 "International Passport (E-passport)": [
  "NIN slip",
  "Birth certificate",
  "Passport photograph",
  "Old passport data page, if renewing"
 ],
 "NIN Registration & Correction": [
  "Birth certificate, old passport or voter's card",
  "Passport photograph",
  "Supporting document for a correction"
 ],
 "Export / Import Licensing": [
  "CAC certificate",
  "TIN certificate"
 ],
 "Student Visa & Relocation": [
  "International passport data page",
  "Academic certificates and transcripts"
 ],
 "GRC Review": [
  "CAC certificate and status report",
  "Licences or certificates you hold"
 ],
 "Fintech & Startup Compliance": [
  "CAC certificate and MEMART",
  "Banking or payments partner agreement"
 ],
 "Digital & Business Setup": [
  "Valid ID",
  "Logo, if you have one"
 ]
};

// Services that need every person's details (and, for registrations, signatures)
export const REG_SERVICES = ['Business Name Registration', 'Limited Company Registration', 'Incorporated Trustees / NGO'];
export const NIN_SERVICES = [...REG_SERVICES, 'SCUML Registration'];

// Passport form fields that must be present (form_data keys as saved)
const PASSPORT_FIELDS = {
  'Passport Booklet': 'Passport booklet choice', 'Passport Surname': 'Surname', 'Passport First Name': 'First name', 'Passport Sex': 'Sex',
  'Passport Date of Birth': 'Date of birth', 'Passport Place of Birth': 'Place of birth', 'Passport NIN': 'NIN',
  'Passport Address': 'Address', 'Passport LGA of Address': 'Local government of address', 'Passport State of Residence': 'State of residence',
  'Passport State of Origin': 'State of origin', 'Passport LGA of Origin': 'Local government of origin', 'Passport Home Town': 'Home town',
  'Passport Occupation': 'Occupation', 'Passport Marital Status': 'Marital status', 'Passport Phone': 'Phone number', 'Passport Email': 'Email address',
  'Passport Next of Kin Name': 'Next of kin', 'Passport Next of Kin Relationship': 'Relationship with next of kin',
  'Passport Next of Kin Address': 'Next of kin address', 'Passport Next of Kin Phone': 'Next of kin phone'
};
const PERSON_FIELDS = { 'Full Name': 'full name', 'NIN': 'NIN', 'Date of Birth': 'date of birth', 'Phone': 'phone', 'Email': 'email', 'Residential Address': 'address', 'Occupation': 'occupation' };

export function reqKey(label) { return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50); }

/**
 * Work out what is missing on a case.
 * Returns { details: [string], documents: [string], actions: [string], unlabelled: number }.
 *  - details: information the client still has to give
 *  - documents: documents not uploaded yet
 *  - actions: things for you to do (e.g. procure a Declaration of Age)
 */
export function missingForCase(c, docs) {
  let f = {};
  try { f = JSON.parse(c.form_data || '{}') || {}; } catch (e) {}
  const services = String(c.services || '').split(',').map(s => s.trim()).filter(Boolean);
  const names = docs.map(d => d.file_name.toLowerCase());
  // An ID or passport photo uploaded under one service's box counts for the others too
  const SAME = [/^valid-id|^nin-slip-or-valid-id/, /^passport-photograph/, /^cac-certificate/];
  const has = slug => names.some(n => n.startsWith(slug + '--'))
    || SAME.some(re => re.test(slug) && names.some(n => n.includes('--') && re.test(n)));
  const out = { details: [], documents: [], actions: [], unlabelled: names.filter(n => !n.includes('--') && !n.startsWith('signature-') && !n.startsWith('lga-certificate-')).length };

  if (!c.email) out.details.push('Client email address');
  if (!c.phone) out.details.push('Client phone number');

  // Registrations: proposed names, what the business does, and where
  if (services.some(s => REG_SERVICES.includes(s))) {
    if (!f['Proposed Name 1'] || !f['Proposed Name 2']) out.details.push('Two proposed names, in order of preference');
    if (!f['Business Category'] || !f['Specific Nature Of Business']) out.details.push('Nature of business: CAC category and specific nature of business');
    if (services.includes('Incorporated Trustees / NGO') && !f['Aims And Objectives']) out.details.push('Aims and objectives of the organisation');
    if (!f['Business Address']) out.details.push('Business address in Nigeria');
  }

  // People on registrations and SCUML
  if (services.some(s => NIN_SERVICES.includes(s))) {
    const count = Object.keys(f).filter(k => /^Person \d+ Full Name$/.test(k)).length;
    if (!count) out.details.push('Details of every director, shareholder, proprietor or trustee (full name, NIN, date of birth, phone, email, address, occupation)');
    for (let i = 1; i <= count; i++) {
      const who = f[`Person ${i} Full Name`] || `Person ${i}`;
      const gaps = Object.entries(PERSON_FIELDS).filter(([k]) => !f[`Person ${i} ${k}`] && !(k === 'NIN' && f[`Person ${i} Passport Number`])).map(([, l]) => l);
      if (gaps.length) out.details.push(`${who}: ${gaps.join(', ')}`);
      if (services.some(s => REG_SERVICES.includes(s)) && !names.some(n => n.startsWith(`signature-${i}-`))) out.documents.push(`Signature of ${who}`);
    }
    if (services.includes('Limited Company Registration') && !f['Share Capital']) out.details.push('Proposed share capital');
  }

  // E-passport
  if (services.includes('International Passport (E-passport)')) {
    const gaps = Object.entries(PASSPORT_FIELDS).filter(([k]) => !f[k]).map(([, l]) => l);
    if (gaps.length) out.details.push(`Passport form: ${gaps.join(', ')}`);
    if (f['Passport Previous E Passport'] === 'Yes' && !f['Passport Existing Passport Number']) out.details.push('Previous passport number, dates and place of issue');
    if (!names.some(n => n.startsWith('lga-certificate-'))) out.documents.push('Certificate of Local Government of Origin');
    if (f['Passport Declaration of Age Requested'] === 'Yes') out.actions.push('Procure a Declaration of Age (client asked for it)');
  }

  // Documents for every selected service (each listed once)
  const seen = new Set();
  for (const s of services) for (const label of DOC_REQUIREMENTS[s] || []) {
    const slug = reqKey(label);
    if (seen.has(slug) || /, if /.test(label)) continue; // conditional documents are not counted as missing
    seen.add(slug);
    if (!has(slug)) out.documents.push(label);
  }
  return out;
}
