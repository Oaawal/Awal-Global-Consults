// Guides hub structure: hubs (big sections on /blog/) made of topics
// (the expandable "shelves"). Each post names its topic in frontmatter
// (`topic: costs-and-timelines`); the build script groups posts from there.
//
// - A topic only appears once it has at least one post, so new topics can
//   be added here ahead of time without leaving empty shelves on the site.
// - `desk` is the byline shown on posts in that hub ("Business desk ·
//   Awal Global Consults").
// - `cover` picks the illustration style for post covers (see covers.js).
// - `featured: true` hubs get their own section on /blog/; every topic is
//   also listed in "The library".

module.exports = {
  hubs: [
    {
      slug: 'business',
      label: 'Start and run a business',
      blurb: 'Registering with CAC, choosing a structure, and staying compliant after you open.',
      desk: 'Business desk',
      cover: 'registration',
      topics: [
        { slug: 'choosing-a-structure', label: 'Choosing a structure' },
        { slug: 'registering-with-cac', label: 'Registering with CAC' },
        { slug: 'costs-and-timelines', label: 'Costs and timelines' },
        { slug: 'after-registration', label: 'After registration' },
        { slug: 'ngos-and-trustees', label: 'NGOs and trustees' },
        { slug: 'licences-and-permits', label: 'Licences and permits' }
      ]
    },
    {
      slug: 'compliance',
      label: 'Tax, compliance and data',
      blurb: 'TIN and the new tax law, AML and SCUML, data protection, and keeping your business safe online.',
      desk: 'Compliance desk',
      cover: 'compliance',
      topics: [
        { slug: 'tax-and-tin', label: 'Tax and TIN' },
        { slug: 'aml-kyc-scuml', label: 'AML, KYC and SCUML' },
        { slug: 'data-protection', label: 'Data protection (NDPA)' },
        { slug: 'cybersecurity', label: 'Cybersecurity and fraud' }
      ]
    },
    {
      slug: 'brand',
      label: 'Protect your brand',
      blurb: 'Trademarks, classes, searches and what registration really costs.',
      desk: 'Brand desk',
      cover: 'brand',
      topics: [
        { slug: 'trademark-basics', label: 'Trademark basics' },
        { slug: 'trademark-costs', label: 'Trademark costs and timelines' }
      ]
    },
    {
      slug: 'immigration',
      label: 'Identity, immigration and study',
      blurb: 'NIN and passports, expatriate permits, and studying abroad from Nigeria.',
      desk: 'Immigration desk',
      cover: 'travel',
      topics: [
        { slug: 'nin-and-passports', label: 'NIN and passports' },
        { slug: 'expatriates-and-cerpac', label: 'Expatriates and CERPAC' },
        { slug: 'study-abroad', label: 'Study abroad' }
      ]
    },
    {
      slug: 'abroad',
      label: 'Nigerians abroad',
      blurb: 'Registering, running and protecting a Nigerian business from wherever you live.',
      desk: 'Diaspora desk',
      cover: 'globe',
      featured: true,
      topics: [
        { slug: 'abroad-uk', label: 'United Kingdom', code: 'GB' },
        { slug: 'abroad-us', label: 'United States', code: 'US' },
        { slug: 'abroad-canada', label: 'Canada', code: 'CA' },
        { slug: 'abroad-ireland', label: 'Ireland', code: 'IE' },
        { slug: 'abroad-uae', label: 'United Arab Emirates', code: 'AE' },
        { slug: 'abroad-all', label: 'All diaspora', code: '🌍' }
      ]
    },
    {
      slug: 'reference',
      label: 'Data and reference',
      blurb: 'Dated fee tables, deadline calendars and checklists. Free to cite.',
      desk: 'Research desk',
      cover: 'data',
      featured: true,
      topics: [
        { slug: 'fees-and-costs', label: 'Fees and costs' },
        { slug: 'deadlines-and-calendars', label: 'Deadlines and calendars' },
        { slug: 'checklists-and-templates', label: 'Checklists and templates' }
      ]
    }
  ]
};
