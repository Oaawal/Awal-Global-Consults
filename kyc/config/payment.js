/**
 * AWAL GLOBAL CONSULTS — PAYMENT CONFIGURATION
 * =============================================
 * Configure pricing and payment rules per service.
 * Change values here without touching any other file.
 *
 * type:
 *   "fixed"    — set price, configurable deposit %
 *   "tiered"   — multiple packages, each with a price
 *   "quote"    — no fixed price, quote required
 *   "milestone"— custom payment milestones (e.g. website)
 *
 * deposit:     minimum % required to begin processing (0–100)
 * currency:    display currency symbol
 */

window.AGC_PAYMENT = {

  currency: "₦",

  bank: {
    name: "Awal Global Consults Limited",
    bank: "KudaBank",
    account: "3003466189",
    note: "Use your full name as payment narration"
  },

  paystack: {
    link: "https://paystack.shop/pay/awalglobal"
  },

  whatsapp: "+2347038336596",

  services: {

    // ─── CAC & CORPORATE ───────────────────────────────────────────────
    bn: {
      type: "tiered",
      deposit: 50,
      tiers: [
        { id: "basic",   label: "Basic Starter",    price: 35000, description: "Name check, CAC certificate, TIN" },
        { id: "boost",   label: "Business Boost",   price: 65000, description: "Basic + TIN validation, letterhead, ID card, free delivery" },
        { id: "premium", label: "Premium Presence", price: 95000, description: "Boost + custom logo, 50 business cards, framed certificate, brand guide" }
      ]
    },

    ltd: {
      type: "tiered",
      deposit: 50,
      tiers: [
        { id: "core",     label: "Core Setup",          price: 75000,  description: "Name check, CAC certificate, MEMART, TIN, TIN validation" },
        { id: "pro",      label: "Smart Pro",           price: 95000,  description: "Core + letterhead, director ID card, free delivery" },
        { id: "complete", label: "Complete Brand Suite", price: 125000, description: "Pro + custom logo, 50 business cards, framed cert, brand guide, bank account support" }
      ]
    },

    it: {
      type: "quote",
      deposit: 50,
      note: "Pricing varies based on number of trustees and complexity. Quote provided after review."
    },

    annual_returns: {
      type: "quote",
      deposit: 100,
      note: "Price depends on years of returns and company size. Quote provided after review."
    },

    change_directors: {
      type: "fixed",
      price: 25000,
      deposit: 100
    },

    change_shareholders: {
      type: "fixed",
      price: 25000,
      deposit: 100
    },

    share_capital: {
      type: "fixed",
      price: 30000,
      deposit: 100
    },

    company_secretary: {
      type: "quote",
      deposit: 100,
      note: "Pricing based on scope and frequency of secretarial services required."
    },

    // ─── TAX & REVENUE ─────────────────────────────────────────────────
    tin: {
      type: "fixed",
      price: 10000,
      deposit: 100
    },

    tin_validation: {
      type: "fixed",
      price: 5000,
      deposit: 100
    },

    tax_clearance: {
      type: "quote",
      deposit: 50,
      note: "Price depends on number of years and complexity of tax history."
    },

    vat: {
      type: "quote",
      deposit: 50,
      note: "Registration and filing fees quoted separately based on filing frequency."
    },

    paye: {
      type: "quote",
      deposit: 50,
      note: "Price based on number of employees and filing frequency."
    },

    payroll: {
      type: "quote",
      deposit: 100,
      note: "Monthly retainer price based on number of employees."
    },

    accounting: {
      type: "quote",
      deposit: 100,
      note: "Monthly retainer price based on transaction volume and reporting requirements."
    },

    scuml: {
      type: "fixed",
      price: 30000,
      deposit: 50
    },

    // ─── REGULATORY & LICENSING ────────────────────────────────────────
    nipc: {
      type: "quote",
      deposit: 50,
      note: "Quote provided based on investment amount and business type."
    },

    business_permit: {
      type: "quote",
      deposit: 50,
      note: "Price varies by permit type and issuing authority."
    },

    expatriate_quota: {
      type: "quote",
      deposit: 50,
      note: "Quote based on quota type and number of expatriate positions."
    },

    son: {
      type: "quote",
      deposit: 50,
      note: "Quote based on product type and certification scope."
    },

    nafdac: {
      type: "quote",
      deposit: 50,
      note: "Quote based on product category and import/local manufacturing status."
    },

    ndpr: {
      type: "quote",
      deposit: 100,
      note: "Quote based on organisation size and data processing complexity."
    },

    iso: {
      type: "quote",
      deposit: 50,
      note: "Quote based on ISO standard required and organisation size."
    },

    // ─── INTELLECTUAL PROPERTY & LEGAL ─────────────────────────────────
    trademark: {
      type: "quote",
      deposit: 100,
      note: "Price varies by mark type, number of classes, and applicant type. Quote provided after review."
    },

    copyright: {
      type: "fixed",
      price: 25000,
      deposit: 100
    },

    legal_doc: {
      type: "tiered",
      deposit: 100,
      tiers: [
        { id: "simple",   label: "Simple Document",   price: 15000, description: "Affidavit, basic letter, or simple agreement" },
        { id: "standard", label: "Standard Document",  price: 30000, description: "Contract, MOU, employment agreement, or privacy policy" },
        { id: "complex",  label: "Complex Document",   price: 60000, description: "Multi-party agreement, terms of service, or bespoke legal documentation" }
      ]
    },

    legal_advisory: {
      type: "tiered",
      deposit: 100,
      tiers: [
        { id: "consult", label: "One-Time Consultation", price: 20000, description: "Single session guidance (60 minutes)" },
        { id: "retainer", label: "Monthly Retainer",     price: 75000, description: "Ongoing advisory support — up to 4 sessions per month" }
      ]
    },

    // ─── IDENTITY & IMMIGRATION ────────────────────────────────────────
    nin: {
      type: "fixed",
      price: 5000,
      deposit: 100
    },

    data_correction: {
      type: "fixed",
      price: 8000,
      deposit: 100
    },

    student_visa: {
      type: "quote",
      deposit: 50,
      note: "Quote based on target country, institution type, and level of support required."
    },

    immigration: {
      type: "quote",
      deposit: 50,
      note: "Quote based on permit type and applicant circumstances."
    },

    export_import: {
      type: "quote",
      deposit: 50,
      note: "Quote based on type of goods, trade route, and documentation required."
    },

    // ─── DIGITAL & BUSINESS ────────────────────────────────────────────
    cybersecurity: {
      type: "quote",
      deposit: 50,
      note: "Quote based on scope of assessment or training required."
    },

    virtual_office: {
      type: "tiered",
      deposit: 100,
      tiers: [
        { id: "monthly",   label: "Monthly",   price: 10000, description: "Business address + mail notification for 1 month" },
        { id: "quarterly", label: "Quarterly", price: 25000, description: "Business address + mail for 3 months — save ₦5,000" },
        { id: "annual",    label: "Annual",    price: 80000, description: "Business address + mail for 12 months — save ₦40,000" }
      ]
    },

    domain: {
      type: "quote",
      deposit: 100,
      note: "Price depends on domain extension and registration period."
    },

    website: {
      type: "milestone",
      deposit: 50,
      milestones: [
        { label: "Deposit to commence", percent: 50 },
        { label: "Design approval",     percent: 25 },
        { label: "Final delivery",      percent: 25 }
      ],
      note: "Website pricing is custom-quoted based on scope, pages, and features required."
    }
  }
};