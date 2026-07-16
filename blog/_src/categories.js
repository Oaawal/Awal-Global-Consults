// Blog category config. Add new categories here — the build script
// picks them up automatically for the listing page filters and
// per-post category badges/links. Mirrors the pattern used in
// kyc/config/services.js so the two systems stay easy to reason about.
//
// IMPORTANT: hrefs here are bare, root-relative-looking paths with NO
// leading slash (e.g. "cac-registration.html", "kyc/"). The build
// script prepends the correct "../" depth prefix depending on where
// it's being rendered (blog/index.html vs blog/{slug}/index.html).
// This matches the site-wide convention (absolute "/" paths were
// removed site-wide so pages work when opened locally too).

module.exports = {
  categories: {
    'cac-registration': {
      label: 'CAC Registration',
      description: 'Business name, company, and incorporated trustees registration in Nigeria.',
      relatedService: { href: 'cac-registration.html', label: 'Start CAC Registration' }
    },
    'trademarks-ip': {
      label: 'Trademarks & IP',
      description: 'Trademark registration, classes, and intellectual property protection.',
      relatedService: { href: 'trademark-ip.html', label: 'Start Trademark Registration' }
    },
    'kyc-compliance': {
      label: 'KYC & Compliance',
      description: 'KYC onboarding, CAMA compliance, data protection, and AML obligations.',
      relatedService: { href: 'kyc/', label: 'Start KYC Onboarding' }
    },
    'tax-compliance': {
      label: 'Tax & Revenue',
      description: 'Nigeria Tax Act, tax administration, filing, and revenue compliance.',
      relatedService: { href: 'kyc/', label: 'Start Tax Registration' }
    },
    'business-advisory': {
      label: 'Business Advisory',
      description: 'Corporate structuring, licensing, and sector-specific guidance.',
      relatedService: { href: 'business-advisory.html', label: 'Talk to an Advisor' }
    }
  }
};
