# GRC portfolio

Public pages: `/grc-portfolio` (method + work samples) and `/trust` (our own security programme).
Downloads: `downloads/grc/` (gap assessment, risk assessment PDF + XLSX register, policy, NDPA checklist).

## Rebuild after changing content
All content lives in `data.py` (sample company, gap scores, risks, roadmap) and `pages.py` (page text, Trust controls and self-assessment).

```
python3 ops/grc-portfolio/build.py   # HTML for PDFs + the Excel register
node ops/grc-portfolio/pdf.js        # PDFs into downloads/grc/
python3 ops/grc-portfolio/pages.py   # grc-portfolio.html and trust.html
```

## Rules
- Samples use the fictional Example Foods Ltd. Never publish client data, even anonymised, without written consent.
- Trust page claims must match the code (functions/_lib/admin-auth.js, compliance.js, cases.js, _headers). Update the self-assessment when a gap closes.
- Don't claim certifications not yet held.

## Building the portfolio further (suggested order)
1. Vendor risk questionnaire + completed sample assessment of a fictional supplier.
2. Incident and data breach response plan + tabletop exercise report.
3. Statement of Applicability (ISO 27001 Annex A, 93 controls) for Example Foods Ltd.
4. Data Protection Impact Assessment (NDPA s.28) for a fintech onboarding flow.
5. Internal audit report: one audit against ISO 27001 clauses 4–10 (fits the internal auditor training).
6. Close Trust-page gaps (second admin, sign-in alerts, restore test) and record them as evidence.

Certifications employers screen for: ISC2 CC (free entry), CompTIA Security+, ISO/IEC 27001 Lead Implementer or Lead Auditor, then CISA or CRISC with experience.
