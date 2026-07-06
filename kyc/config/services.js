/**
 * AWAL GLOBAL CONSULTS — SERVICE CONFIGURATION
 * =============================================
 * Each service is a self-contained module definition.
 * To add a new service: add an entry here and create
 * a corresponding module in /modules/services/.
 *
 * Fields:
 *   id         — unique identifier (snake_case)
 *   name       — display name
 *   category   — grouping for the selection screen
 *   description — short description shown in service card
 *   timeline   — estimated processing time
 *   module     — path to the JS module file
 *   requiresPersonal — whether the shared personal details step is needed
 *   requirements — array of strings shown in the requirements notice
 */

window.AGC_SERVICES = [

  // ─── CAC & CORPORATE ───────────────────────────────────────────────────
  {
    id: "bn",
    name: "Business Name Registration",
    category: "CAC & Corporate",
    description: "Sole proprietorship — registered within 24 hours",
    timeline: "24 hours",
    module: "modules/services/bn.js",
    requiresPersonal: true,
    requirements: [
      "Valid government-issued ID (NIN card, passport, or driver's licence)",
      "Passport photograph (plain background, recent)",
      "Signature on white paper (photographed or scanned)",
      "2 preferred business name options (CAC checks availability)",
      "Business address in Nigeria",
      "Your 11-digit NIN number",
      "Nature of business description"
    ]
  },
  {
    id: "ltd",
    name: "Private Limited Company",
    category: "CAC & Corporate",
    description: "RC company registration — 3–7 business days",
    timeline: "3–7 business days",
    module: "modules/services/ltd.js",
    requiresPersonal: true,
    requirements: [
      "Valid ID for each director and shareholder",
      "Passport photograph for each director and shareholder",
      "Signature for each director and shareholder",
      "11-digit NIN for each director and shareholder",
      "2 preferred company name options",
      "Principal business activities description",
      "Proposed share capital amount",
      "Percentage shareholding for each shareholder",
      "Registered office address in Nigeria"
    ]
  },
  {
    id: "it",
    name: "Incorporated Trustees / NGO",
    category: "CAC & Corporate",
    description: "Non-profit and faith-based organisation registration — 25–30 business days",
    timeline: "25–30 business days",
    module: "modules/services/it.js",
    requiresPersonal: true,
    requirements: [
      "Minimum of 2 trustees required",
      "Valid ID, passport photo, and signature for each trustee",
      "11-digit NIN for each trustee",
      "2 preferred organisation name options",
      "Objects and purpose of the organisation",
      "Organisation's physical address in Nigeria",
      "Names and contact details of all trustees"
    ]
  },
  {
    id: "annual_returns",
    name: "CAC Annual Returns",
    category: "CAC & Corporate",
    description: "Yearly statutory compliance filing with CAC",
    timeline: "3–5 business days",
    module: "modules/services/annual_returns.js",
    requiresPersonal: false,
    requirements: [
      "CAC certificate (RC or BN number)",
      "Company / business name as registered",
      "Year(s) of returns to be filed",
      "Current list of directors and shareholders (for companies)",
      "Current registered office address"
    ]
  },
  {
    id: "change_directors",
    name: "Change of Directors",
    category: "CAC & Corporate",
    description: "Add, remove, or update company directors",
    timeline: "5–7 business days",
    module: "modules/services/change_directors.js",
    requiresPersonal: false,
    requirements: [
      "RC number and company name",
      "CAC certificate",
      "Valid ID, passport photo, NIN, and signature of new director(s)",
      "Board resolution approving the change",
      "Details of director(s) being added or removed"
    ]
  },
  {
    id: "change_shareholders",
    name: "Change of Shareholders",
    category: "CAC & Corporate",
    description: "Share transfer, allotment, or update of shareholders",
    timeline: "5–7 business days",
    module: "modules/services/change_shareholders.js",
    requiresPersonal: false,
    requirements: [
      "RC number and company name",
      "CAC certificate",
      "Valid ID, passport photo, NIN, and signature of incoming shareholder(s)",
      "Share transfer form or allotment resolution",
      "Current shareholding structure"
    ]
  },
  {
    id: "share_capital",
    name: "Increase of Share Capital",
    category: "CAC & Corporate",
    description: "Increase a company's authorised share capital",
    timeline: "5–7 business days",
    module: "modules/services/share_capital.js",
    requiresPersonal: false,
    requirements: [
      "RC number and company name",
      "Current share capital amount",
      "Proposed new share capital amount",
      "Board resolution or special resolution approving the increase",
      "CAC certificate"
    ]
  },
  {
    id: "company_secretary",
    name: "Company Secretary Services",
    category: "CAC & Corporate",
    description: "Ongoing statutory compliance and secretarial support",
    timeline: "Ongoing",
    module: "modules/services/company_secretary.js",
    requiresPersonal: false,
    requirements: [
      "RC number and company name",
      "CAC certificate and MEMART",
      "Current directors and shareholders list",
      "Description of secretarial support required"
    ]
  },

  // ─── TAX & REVENUE ─────────────────────────────────────────────────────
  {
    id: "tin",
    name: "TIN Registration",
    category: "Tax & Revenue",
    description: "Tax Identification Number — Nigerian Revenue Service (NRS)",
    timeline: "2–5 business days",
    module: "modules/services/tin.js",
    requiresPersonal: true,
    requirements: [
      "Valid ID (NIN card, passport, or driver's licence)",
      "11-digit NIN",
      "Business name and RC/BN number (if business TIN)",
      "Business address",
      "Nature of business"
    ]
  },
  {
    id: "tin_validation",
    name: "TIN Validation",
    category: "Tax & Revenue",
    description: "Verify and validate an existing TIN — NRS",
    timeline: "1–2 business days",
    module: "modules/services/tin_validation.js",
    requiresPersonal: true,
    requirements: [
      "Existing Tax Identification Number (TIN)",
      "Full name as on NRS records",
      "Business name (if business TIN)"
    ]
  },
  {
    id: "tax_clearance",
    name: "Tax Clearance Certificate",
    category: "Tax & Revenue",
    description: "FIRS/NRS tax clearance certificate",
    timeline: "5–10 business days",
    module: "modules/services/tax_clearance.js",
    requiresPersonal: true,
    requirements: [
      "TIN number",
      "CAC certificate (if business)",
      "Evidence of tax payments for the last 3 years",
      "Audited financial statements or tax returns",
      "Business address"
    ]
  },
  {
    id: "vat",
    name: "VAT Registration & Filing",
    category: "Tax & Revenue",
    description: "Value Added Tax registration and periodic filing",
    timeline: "3–5 business days",
    module: "modules/services/vat.js",
    requiresPersonal: false,
    requirements: [
      "TIN number",
      "CAC certificate",
      "Business name and RC/BN number",
      "Business address and nature of business",
      "Monthly/quarterly sales records (for filing)"
    ]
  },
  {
    id: "paye",
    name: "PAYE Registration & Filing",
    category: "Tax & Revenue",
    description: "Pay As You Earn — employer registration and filing",
    timeline: "3–5 business days",
    module: "modules/services/paye.js",
    requiresPersonal: false,
    requirements: [
      "TIN number",
      "CAC certificate",
      "Employee list with names, salaries, and NIN numbers",
      "State of business operations",
      "Business bank account details"
    ]
  },
  {
    id: "payroll",
    name: "Payroll Processing",
    category: "Tax & Revenue",
    description: "Monthly payroll computation and management",
    timeline: "Ongoing — monthly",
    module: "modules/services/payroll.js",
    requiresPersonal: false,
    requirements: [
      "Employee list with names, salaries, account numbers",
      "NIN for each employee",
      "Pay schedule (weekly, bi-weekly, monthly)",
      "Pension details (PFA and RSA numbers)",
      "Any allowances, deductions, or bonuses to apply"
    ]
  },
  {
    id: "accounting",
    name: "Accounting Services",
    category: "Tax & Revenue",
    description: "Bookkeeping, financial records, and reporting",
    timeline: "Ongoing",
    module: "modules/services/accounting.js",
    requiresPersonal: false,
    requirements: [
      "Bank statements (last 3–12 months)",
      "Invoices and receipts",
      "Expense records",
      "Previous financial statements (if available)",
      "Nature of business and transaction volume"
    ]
  },
  {
    id: "scuml",
    name: "SCUML Registration",
    category: "Tax & Revenue",
    description: "Special Control Unit Against Money Laundering — DNFBPs",
    timeline: "5–10 business days",
    module: "modules/services/scuml.js",
    requiresPersonal: true,
    requirements: [
      "CAC certificate (RC or BN number)",
      "Business name as registered",
      "DNFBP business category",
      "Business address",
      "Compliance officer name, NIN, and phone number",
      "Valid ID and passport photo of compliance officer",
      "Nature of business transactions"
    ]
  },

  // ─── REGULATORY & LICENSING ────────────────────────────────────────────
  {
    id: "nipc",
    name: "NIPC Registration",
    category: "Regulatory & Licensing",
    description: "Nigerian Investment Promotion Commission — for foreign investors",
    timeline: "10–15 business days",
    module: "modules/services/nipc.js",
    requiresPersonal: true,
    requirements: [
      "CAC certificate (RC number)",
      "MEMART",
      "Proof of investment capital",
      "Proposed business activities",
      "Evidence of foreign equity (if applicable)",
      "Tax Identification Number (TIN)"
    ]
  },
  {
    id: "business_permit",
    name: "Business Permit",
    category: "Regulatory & Licensing",
    description: "Operational business permit from relevant authority",
    timeline: "Varies by permit type",
    module: "modules/services/business_permit.js",
    requiresPersonal: false,
    requirements: [
      "CAC certificate",
      "TIN number",
      "Business address",
      "Nature of business operations",
      "Type of permit required (specify)",
      "Any existing permits or licences"
    ]
  },
  {
    id: "expatriate_quota",
    name: "Expatriate Quota / CERPAC",
    category: "Regulatory & Licensing",
    description: "Expatriate quota, CERPAC, and foreign staff compliance",
    timeline: "15–30 business days",
    module: "modules/services/expatriate_quota.js",
    requiresPersonal: true,
    requirements: [
      "CAC certificate",
      "Valid passport of expatriate",
      "Employment letter or contract",
      "Educational and professional certificates",
      "Company's existing expatriate quota approval (if any)",
      "Proposed position and job description"
    ]
  },
  {
    id: "son",
    name: "SON Registration",
    category: "Regulatory & Licensing",
    description: "Standards Organisation of Nigeria — product certification",
    timeline: "15–30 business days",
    module: "modules/services/son.js",
    requiresPersonal: false,
    requirements: [
      "CAC certificate",
      "Product samples or technical specifications",
      "Product labels and packaging",
      "Factory or production facility address",
      "Quality management documentation (if available)"
    ]
  },
  {
    id: "nafdac",
    name: "NAFDAC Registration",
    category: "Regulatory & Licensing",
    description: "Food, drug, cosmetic, and chemical product registration",
    timeline: "30–90 business days",
    module: "modules/services/nafdac.js",
    requiresPersonal: false,
    requirements: [
      "CAC certificate",
      "Product samples",
      "Product composition/formulation",
      "Labels and packaging artwork",
      "Manufacturing site details or import documentation",
      "Country of origin certificate (for imported products)"
    ]
  },
  {
    id: "ndpr",
    name: "NDPR / Data Protection",
    category: "Regulatory & Licensing",
    description: "Nigeria Data Protection Regulation compliance and audit",
    timeline: "5–15 business days",
    module: "modules/services/ndpr.js",
    requiresPersonal: false,
    requirements: [
      "CAC certificate",
      "Description of data processing activities",
      "Current privacy policy (if any)",
      "Data Protection Officer details (if applicable)",
      "List of third-party data processors used"
    ]
  },
  {
    id: "iso",
    name: "ISO Certification Support",
    category: "Regulatory & Licensing",
    description: "ISO standards preparation and certification support",
    timeline: "60–180 business days",
    module: "modules/services/iso.js",
    requiresPersonal: false,
    requirements: [
      "CAC certificate",
      "ISO standard required (e.g. ISO 9001, ISO 27001)",
      "Organisation structure and headcount",
      "Current quality management documentation (if any)",
      "Business processes and service description"
    ]
  },

  // ─── INTELLECTUAL PROPERTY & LEGAL ─────────────────────────────────────
  {
    id: "trademark",
    name: "Trademark Registration",
    category: "IP & Legal",
    description: "Word, logo, slogan, combined, or other marks",
    timeline: "18–24 months (FIPO process)",
    module: "modules/services/trademark.js",
    requiresPersonal: true,
    requirements: [
      "The word, name, slogan, or logo to be registered",
      "Trademark class(es) — we will advise if unsure",
      "High-resolution logo file (if logo or combined mark)",
      "Applicant name (individual or company)",
      "Applicant address in Nigeria",
      "Applicant phone number",
      "CAC certificate (if filing under a company name)"
    ]
  },
  {
    id: "copyright",
    name: "Copyright Registration",
    category: "IP & Legal",
    description: "Literary, artistic, musical, and software works",
    timeline: "30–60 business days",
    module: "modules/services/copyright.js",
    requiresPersonal: true,
    requirements: [
      "Title of the work",
      "Type of work (literary, artistic, musical, software, etc.)",
      "Year the work was created",
      "Author/creator full name",
      "Copy or sample of the work (file upload)"
    ]
  },
  {
    id: "legal_doc",
    name: "Legal Document Drafting",
    category: "IP & Legal",
    description: "Agreements, MOUs, affidavits, contracts, privacy policies",
    timeline: "2–5 business days",
    module: "modules/services/legal_doc.js",
    requiresPersonal: false,
    requirements: [
      "Type of document needed",
      "Full names and roles of all parties involved",
      "Key terms and conditions to be captured",
      "Purpose and context of the document",
      "Any existing draft or reference document (optional)"
    ]
  },
  {
    id: "legal_advisory",
    name: "Corporate Advisory",
    category: "IP & Legal",
    description: "Business structure, compliance, and legal strategy guidance",
    timeline: "Scheduled consultation",
    module: "modules/services/legal_advisory.js",
    requiresPersonal: false,
    requirements: [
      "Description of the business or legal issue",
      "Any existing legal documents or correspondence",
      "Business registration details (if applicable)",
      "Preferred consultation format (WhatsApp, email, or meeting)"
    ]
  },

  // ─── IDENTITY & IMMIGRATION ────────────────────────────────────────────
  {
    id: "nin",
    name: "NIN Registration / Retrieval",
    category: "Identity & Immigration",
    description: "New NIN registration or retrieval of existing NIN",
    timeline: "1–3 business days",
    module: "modules/services/nin.js",
    requiresPersonal: true,
    requirements: [
      "Valid government-issued ID (birth certificate, old passport, or voter's card)",
      "Passport photograph",
      "Date of birth",
      "State of origin",
      "Home address"
    ]
  },
  {
    id: "data_correction",
    name: "Data Correction",
    category: "Identity & Immigration",
    description: "NIN / NIMC identity record correction or update",
    timeline: "3–7 business days",
    module: "modules/services/data_correction.js",
    requiresPersonal: true,
    requirements: [
      "Existing NIN number",
      "Valid supporting document for the correction (e.g. birth certificate, court affidavit)",
      "Details of the error and what the correct information should be",
      "Passport photograph"
    ]
  },
  {
    id: "student_visa",
    name: "Student Visa Assistance",
    category: "Identity & Immigration",
    description: "School applications, visa preparation, and relocation support",
    timeline: "Varies by country and institution",
    module: "modules/services/student_visa.js",
    requiresPersonal: true,
    requirements: [
      "Valid international passport (minimum 6 months validity)",
      "Academic certificates and transcripts",
      "Preferred country and institutions",
      "Proof of financial capacity",
      "Statement of purpose (we can assist with drafting)",
      "Passport photographs"
    ]
  },
  {
    id: "immigration",
    name: "Immigration Support",
    category: "Identity & Immigration",
    description: "CERPAC, business visa, resident permits, and related support",
    timeline: "Varies by permit type",
    module: "modules/services/immigration.js",
    requiresPersonal: true,
    requirements: [
      "Valid international passport",
      "Current visa or permit (if applicable)",
      "Employment or business documentation",
      "Passport photographs",
      "Type of permit or support required"
    ]
  },
  {
    id: "export_import",
    name: "Export / Import Documentation",
    category: "Identity & Immigration",
    description: "Trade documentation and licensing support",
    timeline: "5–10 business days",
    module: "modules/services/export_import.js",
    requiresPersonal: false,
    requirements: [
      "CAC certificate",
      "TIN number",
      "Nature of goods to be exported or imported",
      "Country of origin or destination",
      "Existing trade permits or licences (if any)"
    ]
  },

  // ─── DIGITAL & BUSINESS SUPPORT ───────────────────────────────────────
  {
    id: "cybersecurity",
    name: "Cybersecurity Services",
    category: "Digital & Business",
    description: "Digital safety assessments, awareness, and guidance",
    timeline: "Varies by scope",
    module: "modules/services/cybersecurity.js",
    requiresPersonal: false,
    requirements: [
      "Description of the cybersecurity concern or requirement",
      "Type of systems or platforms involved",
      "Business size and number of users",
      "Any recent security incidents (optional)"
    ]
  },
  {
    id: "virtual_office",
    name: "Virtual Office",
    category: "Digital & Business",
    description: "Professional business address and mail handling",
    timeline: "1–2 business days",
    module: "modules/services/virtual_office.js",
    requiresPersonal: true,
    requirements: [
      "Valid ID",
      "Passport photograph",
      "Business name (registered or proposed)",
      "Type of virtual office package required",
      "Duration required (monthly, quarterly, annual)"
    ]
  },
  {
    id: "domain",
    name: "Domain Registration",
    category: "Digital & Business",
    description: ".com.ng, .ng, .com and other domain extensions",
    timeline: "Same day",
    module: "modules/services/domain.js",
    requiresPersonal: false,
    requirements: [
      "Preferred domain name(s) — at least 3 options",
      "Domain extension preferred (.com.ng, .ng, .com, etc.)",
      "Duration (1 year, 2 years, etc.)",
      "Hosting required? (yes/no)"
    ]
  },
  {
    id: "website",
    name: "Website Design & Development",
    category: "Digital & Business",
    description: "Professional business websites built to your brand",
    timeline: "2–6 weeks depending on scope",
    module: "modules/services/website.js",
    requiresPersonal: false,
    requirements: [
      "Business name and logo (if available)",
      "Brand colours and style preferences",
      "Type of website (brochure, e-commerce, booking, etc.)",
      "List of pages required",
      "Reference websites you like",
      "Domain name (if already registered)"
    ]
  }
];

// Category order for display
window.AGC_CATEGORIES = [
  "CAC & Corporate",
  "Tax & Revenue",
  "Regulatory & Licensing",
  "IP & Legal",
  "Identity & Immigration",
  "Digital & Business"
];