# Blog system — how it works

This blog is plain static HTML, generated from Markdown so every post
gets consistent SEO metadata, schema markup, and styling automatically.
Nothing here needs a server-side build step on Cloudflare Pages — you
run the build locally, commit the generated HTML, and push like normal.

## Folder structure

```
blog/
  _src/                    ← source files (not linked from the site, safe to ignore when browsing)
    content/*.md           ← write your posts here
    templates/post.html    ← HTML shell for individual posts
    templates/index.html   ← HTML shell for listing pages (main + category)
    categories.js          ← category config (label + related service link)
    markdown.js            ← tiny markdown → HTML converter
    frontmatter.js         ← tiny frontmatter parser
    build-blog.js           ← the build script itself
  styles/blog.css          ← blog-specific styles (site-wide style.css still applies too)
  index.html               ← GENERATED — the main blog listing page
  category/{slug}/index.html ← GENERATED — one listing page per category
  {slug}/index.html        ← GENERATED — one folder per post
  rss.xml                  ← GENERATED — RSS feed
```

**Path convention:** the whole site uses relative paths (no leading "/"),
so pages still work if opened directly from disk. The build script
handles this automatically — it computes the right "../" depth for
wherever a page ends up and rewrites any "/assets/..." style paths
you write in markdown into the correct relative form. You don't need
to think about this when writing content.

## Adding a new post

1. Create a new `.md` file in `blog/_src/content/`, e.g. `trademark-classes-explained.md`.
2. Add frontmatter at the top, then write the post in Markdown below it:

```
---
title: Trademark Classes Explained: What They Are and Why They Matter
slug: trademark-classes-explained
date: 2026-07-21
category: trademarks-ip
description: A short meta description under 160 characters for search results.
excerpt: A slightly longer teaser shown on the blog listing card.
cta_text: One or two sentences shown in the call-to-action box at the end of the post.
whatsapp_topic: trademark registration
---

## Your first heading

Write your post here using standard Markdown: **bold**, *italic*,
[links](https://example.com), lists, and `## headings` (used to build
the on-page table of contents automatically).
```

Valid `category` values are defined in `blog/_src/categories.js`:
`cac-registration`, `trademarks-ip`, `kyc-compliance`, `business-advisory`.
Add a new one there if you need a new topic cluster.

3. From the **repo root**, run:

```
node blog/_src/build-blog.js
```

This regenerates every post, the listing page, the RSS feed, and
updates `sitemap.xml` (it safely replaces old `/blog/` entries each
time, so re-running it never creates duplicates).

4. Deploy exactly as before:

```
git add .
git commit -m "Add trademark classes blog post"
git push
```

## Notes

- No npm install required — the build script only uses Node's built-ins.
- The Markdown parser is intentionally simple (headings, paragraphs,
  bold/italic, links, lists, blockquotes, code spans, horizontal
  rules). It covers everything a long-form article needs without
  pulling in a dependency.
- Each post's related "Start Registration" / "Chat on WhatsApp" CTA is
  driven by the category's `relatedService` in `categories.js` — set
  it once per category rather than per post.
