/**
 * CAC's lists, as they appear on the CAC portal (also used by the application form in kyc/index.html).
 */
export const CAC_CATEGORIES = [
  "Accommodation and Food Service Activities",
  "Activities of Extraterritorial Organisations and Bodies",
  "Activities of Households as Employers; Undifferentiated Goods- and Services-Producing Activities of Households for Own Use",
  "Administrative and Support Service Activities",
  "Agriculture, Forestry and Fishing",
  "Arts, Entertainment and Recreation",
  "Community Based Association",
  "Construction",
  "Cultural Based Association",
  "Digital Services - Agricultural Services",
  "Digital Services - Commerce & Retail Services",
  "Digital Services - Communication Services",
  "Digital Services - Computing & Infrastructure Services",
  "Digital Services - Construction & Engineering Services",
  "Digital Services - Content & Entertainment Services",
  "Digital Services - Digital Public Infrastructure Services",
  "Digital Services - Education & Knowledge Services",
  "Digital Services - Environmental & Utility Services",
  "Digital Services - Financial Services",
  "Digital Services - Healthcare Services",
  "Digital Services - Human Resources & Employment Services",
  "Digital Services - Manufacturing & Industrial Services",
  "Digital Services - Professional Services",
  "Digital Services - Smart Consumer Devices",
  "Digital Services - Transport & Logistics Services",
  "Education",
  "Faith Based Association",
  "Financial and Insurance Activities",
  "Foundation Based Association",
  "Human Health and Social Work Activities",
  "Information and Communication",
  "Manufacturing",
  "Mining and Quarrying",
  "Other Service Activities",
  "Others",
  "Power",
  "Professional, Scientific and Technical Activities",
  "Public Administration and Defence; Compulsory Social Security",
  "Real Estate Activities",
  "Repairs of Motor Vehicles and Motorcycles",
  "Social Clubs Based Association",
  "Sporting Based Association",
  "Transportation",
  "Water Supply, Sewerage, Waste Management and Remediation Activities",
  "Wholesale and Retail Trade; Repair of Motor Vehicles and Motorcycles"
];

export const COMPANY_TYPES = ["Private Company Limited by Shares", "Private Unlimited Company", "Public Company Limited by Shares", "Public Unlimited Company", "Company Limited by Guarantee"];

/** Business details for registrations: form field (as stored on the case) and how to edit it. */
export const BUSINESS_FIELDS = [
  { key: 'Proposed Name 1', label: 'Proposed name (first choice)', type: 'text' },
  { key: 'Proposed Name 2', label: 'Proposed name (second choice)', type: 'text' },
  { key: 'Proposed Name 3', label: 'Proposed name (third choice)', type: 'text' },
  { key: 'Business Category', label: 'Nature of business category', type: 'category' },
  { key: 'Specific Nature Of Business', label: 'Specific nature of business', type: 'text' },
  { key: 'Company Type', label: 'Type of company', type: 'companyType', only: 'Limited Company Registration' },
  { key: 'Other Objects', label: 'Other objects of the company (one per line)', type: 'textarea', only: 'Limited Company Registration' },
  { key: 'Aims And Objectives', label: 'Aims and objectives (one per line)', type: 'textarea', only: 'Incorporated Trustees / NGO' },
  { key: 'Business Address', label: 'Business address in Nigeria', type: 'text' },
  { key: 'Share Capital', label: 'Proposed share capital (₦)', type: 'text', only: 'Limited Company Registration' }
];
