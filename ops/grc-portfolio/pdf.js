// Turn ops/grc-portfolio/out/*.html into PDFs in downloads/grc/. Run after build.py.
const { chromium } = require('playwright');
const path = require('path');
const out = path.join(__dirname, 'out');
const dl = path.join(__dirname, '..', '..', 'downloads', 'grc');
const docs = {
  'gap-assessment': ['sample-gap-assessment-nist-csf-2.pdf', 'Sample gap assessment · Example Foods Ltd (fictional)'],
  'risk-assessment': ['sample-risk-assessment-register.pdf', 'Sample risk assessment · Example Foods Ltd (fictional)'],
  'ndpa-checklist': ['ndpa-2023-compliance-checklist.pdf', 'NDPA 2023 compliance checklist · general guidance'],
  'information-security-policy': ['sample-information-security-policy.pdf', 'Sample policy · Example Foods Ltd (fictional)'],
};
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [src, [file, label]] of Object.entries(docs)) {
    await page.goto('file://' + path.join(out, src + '.html'), { waitUntil: 'networkidle' }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: path.join(dl, file), format: 'A4', printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-family:Arial;font-size:7px;color:#777;width:100%;padding:0 18mm;display:flex;justify-content:space-between"><span>Awal Global Consults Limited · ${label}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    });
    console.log('wrote', file);
  }
  await browser.close();
})();
