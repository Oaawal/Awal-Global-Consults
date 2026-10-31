# Weekly news drafts: instructions for the scheduled session

A scheduled Claude session runs this every Monday morning (Lagos time). It
finds the week's legal, tax and compliance news that matters to Awal Global
Consults' clients and drafts guides for the owner to approve. **It never
publishes.** The owner reviews the drafts and says "publish" in a Claude session.

## 1. Get the repository

Work in the `Awal-Global-Consults` repository (GitHub `Oaawal/Awal-Global-Consults`,
branch `main`). If it isn't already checked out, clone it. Pull the latest `main` first.

Read before writing:
- `ops/content-plan.md`, especially **"Owner answers"**: the firm's confirmed
  prices, timelines, services and figures. Only use prices and timelines from there.
- Two or three recent guides in `blog/_src/content/` to match the house style.

## 2. Find this week's news (last 7 days)

Search the web for news and official updates from the past 7 days on:
- CAC: new rules, fees, portal changes, deadlines, strike-off exercises
- Tax: Nigeria Revenue Service (NRS, formerly FIRS), state IRS, the Nigeria Tax Act
  2025 and Tax Administration Act 2025, VAT, PAYE, WHT, TCC
- AML/KYC: SCUML, EFCC, NFIU, CBN KYC rules
- Data protection: NDPC, NDPA, GAID, audit returns
- Trademarks and IP: Trademarks Registry, NIPO
- Immigration: NIS passports, NIN/NIMC, CERPAC, expatriate quota, Ministry of Interior
- Export/import: NEPC, Customs, SON, NAFDAC
- Diaspora: UK, US, Canada study visa and funding rules that affect Nigerians
- Major court decisions or regulatory notices affecting Nigerian SMEs

Prefer official sources (cac.gov.ng, nrs.gov.ng, ndpc.gov.ng, immigration.gov.ng,
canada.ca, gov.uk) and reputable law firms (Mondaq, Templars, Aelex, OAL, SPA Ajibade)
and news outlets (BusinessDay, Nairametrics, Punch, Premium Times). Skip rumours,
anything you cannot confirm from two sources, and anything older than 14 days.

## 3. Choose 1 to 3 stories

Only stories that a client of a CAC registration, compliance, tax and identity
consultancy would act on. If nothing qualifies, draft nothing and say so.
Don't duplicate an existing guide; if an existing guide is now out of date,
list it in the report instead (don't edit published guides).

## 4. Draft each guide

Create `blog/_src/content/<slug>.md` with this frontmatter:

```
---
title: "…"
seo_title: … (only if the title is over 60 characters; keep it under 60)
slug: …
date: <today, YYYY-MM-DD, Lagos time>
draft: true
topic: <a topic slug from blog/_src/hubs.js>
category: <a key from blog/_src/categories.js>
description: … (one sentence, under 160 characters)
excerpt: …
cta_text: Awal Global Consults … (only services and prices confirmed in ops/content-plan.md)
whatsapp_topic: …
---
```

House style:
- Plain English, short paragraphs, UK spelling, ₦ for naira.
- **No em-dashes (—).** Use colons, commas, brackets or full stops.
- Say what changed, who it affects, what they should do, and by when.
- Use `::: callout` for the key warning, tables where they help, and internal links
  to existing guides as `/blog/<slug>/`.
- End with an FAQ block (at least 3 items) in the `<div class="blog-faq">` format used
  by the other guides, then `## The short version`.
- Name the source and date of each fact in the text (for example "NRS announced on
  3 November 2026 that…"). Never invent figures, dates, fees or deadlines.
- Never promise a service, price or timeline that isn't in "Owner answers".

## 5. Check

```
cd blog/_src
# every /blog/<slug>/ link must point to an existing guide
for f in content/<new slugs>.md; do grep -oE '/blog/[a-z0-9-]+/' $f | sed 's#/blog/##;s#/##' | while read l; do [ -f content/$l.md ] || echo "BROKEN $f -> $l"; done; done
grep -l '—' content/<new slugs>.md   # must print nothing
TZ=Africa/Lagos node build-blog.js    # live build: drafts stay hidden
```

## 6. Commit and report

Commit only the new draft files (and nothing else) to `main` with the message
`Add weekly news drafts for owner review (not published)` and push.
Commit messages must not include any model name.

Finish with a short report for the owner: each draft's title, the news it covers
with source links, and anything they should confirm (a figure, a date, whether
they offer a related service). Also list any published guide the news makes
out of date. The owner publishes by asking Claude to "publish the weekly drafts".
