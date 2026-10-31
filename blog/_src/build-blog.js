#!/usr/bin/env node
/**
 * Blog build script — no npm dependencies required.
 *
 * What it does:
 *   1. Reads every .md file in blog/_src/content/
 *   2. Parses frontmatter + markdown body
 *   3. Renders each post into blog/{slug}/index.html using
 *      blog/_src/templates/post.html (illustrated cover, desk byline,
 *      breadcrumb through hub and topic, related guides)
 *   4. Builds the Guides hub (blog/index.html): featured guide, latest
 *      guides, featured hub sections, and "The library" of every topic
 *   5. Builds one page per topic (blog/topic/{slug}/) and per category
 *      (blog/category/{slug}/), using blog/_src/templates/index.html
 *   6. Writes blog/search-index.json (used by the search box) and blog/rss.xml
 *   7. Updates the root sitemap.xml — replaces any existing /blog/
 *      entries with the current set, leaves every other entry untouched
 *
 * Hubs and topics live in hubs.js; each post names its `topic` in
 * frontmatter. `category` still picks the related-service button.
 *
 * PATH CONVENTION: the site uses relative paths everywhere (no leading
 * "/"), so pages also work when opened directly from disk. This script
 * computes a ROOT prefix per page depth ("../" from blog/index.html,
 * "../../" from blog/{slug}/index.html) and injects it via {{ROOT}} in
 * the templates, and rewrites any "/assets/..." style paths authored
 * in markdown content into the correct relative form for wherever the
 * post is actually rendered.
 *
 * Usage (run from the repo root):
 *   node blog/_src/build-blog.js
 */

const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('./frontmatter');
const { parseMarkdown, slugify } = require('./markdown');
const { categories } = require('./categories');
const { hubs } = require('./hubs');
const { coverSvg } = require('./covers');

const ROOT_DIR = path.resolve(__dirname, '..', '..'); // repo root
const CONTENT_DIR = path.join(__dirname, 'content');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const BLOG_DIR = path.join(ROOT_DIR, 'blog');
const SITE_URL = 'https://awalglobal.com.ng';
const ORG = 'Awal Global Consults';

// Every guide is reviewed by the founder before it is published. A guide can
// opt out with `reviewed_by: none`; `reviewed:` (YYYY-MM-DD) dates the review.
const REVIEWER = {
  name: 'A.O. Abdullateef',
  role: 'Legal Professional, Founder of Awal Global Consults',
  path: 'about#founder'
};


// Search engines cut titles at roughly 60 characters and descriptions at roughly 160,
// so the brand suffix is dropped from long titles and long descriptions are
// shortened at a word boundary. The full text still shows on the page itself.
const BRAND_SUFFIX = ' | Awal Global Consults';
function headTitle(title) {
  return title.length + BRAND_SUFFIX.length <= 65 ? title + BRAND_SUFFIX : title;
}
function metaDescription(text, max = 158) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const sentence = cut.lastIndexOf('. ');
  if (sentence > 90) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,:;]$/, '') + '…';
}

function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf8');
}

function fill(template, map) {
  let out = template;
  for (const [key, value] of Object.entries(map)) {
    out = out.split(`{{${key}}}`).join(value ?? '');
  }
  return out;
}

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Rewrite leading-"/" asset/internal links authored in markdown content
// (e.g. "/assets/images/blog/x.svg") into the correct relative form for
// a page rendered `root` levels deep ("../../" etc). Absolute
// http(s) URLs are left untouched.
function rewriteContentPaths(html, root) {
  return html.replace(/((?:src|href))="\/([^"]+)"/g, (m, attr, p) => `${attr}="${root}${p}"`);
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function wordCount(text) {
  return (text.match(/\S+/g) || []).length;
}

function initials(name) {
  return name.split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// Topic lookup: topic slug -> { topic, hub }
const topicIndex = {};
hubs.forEach(hub => hub.topics.forEach(topic => { topicIndex[topic.slug] = { topic, hub }; }));

// --- 1. Load and parse every post -----------------------------------------

// Guides marked `draft: true` are skipped, so they can sit in the repo for review
// without going live. Set BLOG_INCLUDE_DRAFTS=1 to build them for a local preview.
const INCLUDE_DRAFTS = process.env.BLOG_INCLUDE_DRAFTS === '1';
const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));

const posts = files.map(file => {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const { html, toc } = parseMarkdown(body);

  const slug = data.slug || slugify(data.title);
  const category = categories[data.category] || {
    label: data.category || 'Insights',
    relatedService: { href: '', label: 'Contact Us' }
  };
  const placed = topicIndex[data.topic];
  if (!placed) {
    console.warn(`! ${file}: unknown or missing topic "${data.topic || ''}": add it to hubs.js. Filed under "${hubs[0].topics[0].label}" for now.`);
  }
  const { topic, hub } = placed || { topic: hubs[0].topics[0], hub: hubs[0] };
  const readingTime = Math.max(1, Math.round(wordCount(body) / 200));
  const updated = data.updated && data.updated !== data.date ? data.updated : null;

  return {
    ...data,
    slug,
    category,
    categorySlug: data.category,
    topic,
    hub,
    html,
    toc,
    readingTime,
    dateDisplay: formatDateDisplay(data.date),
    dateIso: new Date(data.date + 'T00:00:00').toISOString(),
    updatedDisplay: updated ? formatDateDisplay(updated) : null,
    updatedIso: new Date((updated || data.date) + 'T00:00:00').toISOString()
  };
}).filter(p => INCLUDE_DRAFTS || !(p.draft === 'true' || p.draft === true))
  .sort((a, b) => new Date(b.date) - new Date(a.date));

if (posts.length === 0) {
  console.log('No posts found in blog/_src/content: nothing to build.');
  process.exit(0);
}

const postsByTopic = {};
posts.forEach(p => { (postsByTopic[p.topic.slug] = postsByTopic[p.topic.slug] || []).push(p); });
const liveTopics = hub => hub.topics.filter(t => postsByTopic[t.slug]);

// --- Shared bits of markup ---------------------------------------------------

function cover(post) {
  return coverSvg(post.hub.cover, post.slug, post.title);
}

function deskByline(post, cls = 'desk') {
  return `<div class="${cls}"><span class="desk-mark">${initials(post.hub.desk)}</span>
          <span><strong>${esc(post.hub.desk)}</strong> &middot; ${ORG}</span>
          <span class="desk-meta">${post.dateDisplay} &middot; ${post.readingTime} min</span></div>`;
}

// `toBlog` is the relative path from the current page to blog/
function card(post, toBlog) {
  return `        <article class="guide-card">
          <a class="guide-card-cover" href="${toBlog}${post.slug}/" tabindex="-1" aria-hidden="true">${cover(post)}<span class="chip">${esc(post.topic.label)}</span></a>
          <h3><a href="${toBlog}${post.slug}/">${esc(post.title)}</a></h3>
          <p>${esc(post.excerpt || post.description)}</p>
          ${deskByline(post, 'desk desk-sm')}
        </article>`;
}

function topicShelf(topic, toBlog, { limit = 3, open = false, code = '' } = {}) {
  const list = postsByTopic[topic.slug] || [];
  const shown = limit ? list.slice(0, limit) : list;
  return `        <details class="shelf"${open ? ' open' : ''}>
          <summary>${code ? `<span class="shelf-code">${esc(code)}</span>` : ''}<span class="shelf-title">${esc(topic.label)}</span><span class="shelf-count">${list.length}</span></summary>
          <ul>
${shown.map(p => `            <li><a href="${toBlog}${p.slug}/">${esc(p.title)}</a></li>`).join('\n')}
          </ul>
          ${list.length > shown.length || limit ? `<a class="shelf-all" href="${toBlog}topic/${topic.slug}/">See all</a>` : ''}
        </details>`;
}

function sectionHead(title, blurb) {
  return `      <div class="hub-head"><h2>${esc(title)}</h2>${blurb ? `<p>${esc(blurb)}</p>` : ''}</div>`;
}

function chipsRow(toBlog, activeSlug) {
  const chips = [`<a href="${toBlog}"${activeSlug ? '' : ' class="on"'}>All</a>`]
    .concat(hubs.flatMap(h => liveTopics(h)).map(t => `<a href="${toBlog}topic/${t.slug}/"${t.slug === activeSlug ? ' class="on"' : ''}>${esc(t.label)}</a>`));
  return `      <div class="guide-chips">
        <div class="guide-chips-scroll">${chips.join('')}</div>
        <a class="guide-search-btn" href="${toBlog}#search" aria-label="Search guides"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></a>
      </div>`;
}

function ctaBand(root) {
  return `  <section class="guide-cta-band">
    <div class="container">
      <div class="guide-cta-inner">
        <div>
          <h2>Rather have it handled for you?</h2>
          <p>Tell us what you need and get a clear, itemised quote within one working day: no payment until you're happy with it.</p>
        </div>
        <div class="hero-actions">
          <a class="btn btn-primary" href="${root}kyc/">Start your application</a>
          <a class="btn btn-whatsapp" href="https://wa.me/2347038336596?text=Hello%2C%20I%20read%20your%20guides%20and%20need%20help" target="_blank" rel="noopener">Chat on WhatsApp</a>
        </div>
      </div>
    </div>
  </section>`;
}

// --- 2. Render each post page (2 levels deep -> ROOT = "../../") -----------

const postTemplate = readTemplate('post.html');
const POST_ROOT = '../../';

posts.forEach(post => {
  const canonical = `${SITE_URL}/blog/${post.slug}/`;

  const tocHtml = post.toc.length
    ? `      <nav class="blog-toc" aria-label="Table of contents">
        <h2>On this page</h2>
        <ul>
${post.toc.map(t => `          <li><a href="#${t.id}">${t.text}</a></li>`).join('\n')}
        </ul>
      </nav>\n`
    : '';

  const articleSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.dateIso,
    dateModified: post.updatedIso,
    articleSection: post.topic.label,
    author: { '@type': 'Organization', name: ORG, url: `${SITE_URL}/` },
    publisher: {
      '@type': 'Organization',
      name: ORG,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/images/logo.png` }
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonical,
      ...(post.reviewed_by !== 'none' ? {
        reviewedBy: { '@type': 'Person', name: REVIEWER.name, jobTitle: 'Legal Professional', url: `${SITE_URL}/about#founder`, worksFor: { '@type': 'Organization', name: ORG } },
        lastReviewed: new Date((post.reviewed || post.updated || post.date) + 'T00:00:00').toISOString()
      } : {})
    },
    image: `${SITE_URL}/assets/images/og-image.jpg`
  }, null, 2);

  const breadcrumbSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE_URL}/blog/` },
      { '@type': 'ListItem', position: 3, name: post.topic.label, item: `${SITE_URL}/blog/topic/${post.topic.slug}/` },
      { '@type': 'ListItem', position: 4, name: post.title, item: canonical }
    ]
  }, null, 2);

  const breadcrumbHtml = `      <nav class="guide-crumbs" aria-label="Breadcrumb">
        <a href="${POST_ROOT}">Home</a><span>&middot;</span><a href="../">Guides</a><span>&middot;</span><a href="../topic/${post.topic.slug}/">${esc(post.topic.label)}</a>
      </nav>`;

  const reviewed = post.reviewed_by !== 'none';
  const bylineHtml = `      <div class="desk desk-lg"><span class="desk-mark">${initials(post.hub.desk)}</span>
        <span><strong>${esc(post.hub.desk)}</strong> &middot; ${ORG}</span>
        <span class="desk-meta">${post.updatedDisplay ? `Updated ${post.updatedDisplay}` : post.dateDisplay} &middot; ${post.readingTime} min read</span></div>${reviewed ? `
      <div class="reviewer"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/></svg>
        <span>Reviewed by <a href="${POST_ROOT}${REVIEWER.path}">${REVIEWER.name}</a>, ${REVIEWER.role}</span></div>` : ''}`;

  // Related: same topic first, then the rest of the hub, newest first
  const related = posts.filter(p => p !== post && p.topic.slug === post.topic.slug)
    .concat(posts.filter(p => p !== post && p.topic.slug !== post.topic.slug && p.hub.slug === post.hub.slug))
    .slice(0, 3);
  const relatedHtml = related.length ? `  <section class="section guide-related">
    <div class="container">
      <div class="hub-head"><h2>Keep reading</h2><p><a href="../topic/${post.topic.slug}/">More on ${esc(post.topic.label.toLowerCase())} &rarr;</a></p></div>
      <div class="guide-grid">
${related.map(p => card(p, '../')).join('\n')}
      </div>
    </div>
  </section>` : '';

  const contentHtml = rewriteContentPaths(post.html, POST_ROOT);

  const rendered = fill(postTemplate, {
    ROOT: POST_ROOT,
    TITLE: post.title,
    HEAD_TITLE: headTitle(post.title),
    DESCRIPTION: post.description,
    META_DESCRIPTION: metaDescription(post.description),
    CANONICAL: canonical,
    ARTICLE_SCHEMA: articleSchema,
    BREADCRUMB_SCHEMA: breadcrumbSchema,
    BREADCRUMB_HTML: breadcrumbHtml,
    BYLINE_HTML: bylineHtml,
    COVER_HTML: cover(post),
    RELATED_HTML: relatedHtml,
    TOPIC_LABEL: esc(post.topic.label),
    DATE_ISO: post.dateIso,
    DATE_DISPLAY: post.dateDisplay,
    CATEGORY_LABEL: post.category.label,
    CATEGORY_SLUG: post.categorySlug,
    READING_TIME: String(post.readingTime),
    TOC_HTML: tocHtml,
    CONTENT: contentHtml,
    CTA_TEXT: post.cta_text || 'Talk to us about your specific situation.',
    RELATED_SERVICE_HREF: post.category.relatedService.href,
    RELATED_SERVICE_LABEL: post.category.relatedService.label,
    WHATSAPP_TOPIC: encodeURIComponent(post.whatsapp_topic || post.category.label)
  });

  const outDir = path.join(BLOG_DIR, post.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), rendered, 'utf8');
  console.log(`Built /blog/${post.slug}/index.html`);
});

// --- 3. Guides hub (blog/index.html) — 1 level deep -> ROOT = "../" ----------

const pageTemplate = readTemplate('index.html');

const SEARCH_SCRIPT = `<script>
(function () {
  var box = document.getElementById('guide-search');
  var out = document.getElementById('guide-search-results');
  if (!box || !out) return;
  var index = null;
  function load() {
    if (index) return Promise.resolve(index);
    return fetch('search-index.json').then(function (r) { return r.json(); }).then(function (d) { index = d; return d; });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  box.addEventListener('focus', load);
  box.addEventListener('input', function () {
    var q = box.value.trim().toLowerCase();
    if (q.length < 2) { out.hidden = true; out.innerHTML = ''; return; }
    load().then(function (items) {
      var words = q.split(/\\s+/);
      var hits = items.filter(function (it) {
        var hay = (it.t + ' ' + it.d + ' ' + it.c).toLowerCase();
        return words.every(function (w) { return hay.indexOf(w) !== -1; });
      }).slice(0, 8);
      out.innerHTML = hits.length
        ? hits.map(function (it) { return '<a href="' + it.u + '"><span>' + esc(it.c) + '</span>' + esc(it.t) + '</a>'; }).join('')
        : '<p>No guides match yet. <a href="https://wa.me/2347038336596?text=' + encodeURIComponent('Hello, I have a question: ' + box.value) + '">Ask us on WhatsApp</a>.</p>';
      out.hidden = false;
    });
  });
})();
</script>`;

const INDEX_ROOT = '../';
// Featured = newest guide; the latest row prefers newer guides from other hubs,
// so the top of the page shows the range of subjects rather than one cluster
// (`featured: true` in a guide's frontmatter picks it instead; the newest such guide wins)
const featured = posts.find(p => p.featured === 'true' || p.featured === true) || posts[0];
const latest = [];
const seenHubs = new Set([featured.hub.slug]);
for (const p of posts.filter(x => x !== featured)) {
  if (latest.length < 3 && !seenHubs.has(p.hub.slug)) { latest.push(p); seenHubs.add(p.hub.slug); }
}
for (const p of posts.filter(x => x !== featured)) if (latest.length < 3 && !latest.includes(p)) latest.push(p);

const hubBody = `  <section class="guide-hero">
    <div class="container">
      <nav class="guide-crumbs" aria-label="Breadcrumb"><a href="${INDEX_ROOT}">Home</a><span>&middot;</span><span>Awal Guides</span></nav>
      <span class="guide-eyebrow"><span class="dot"></span>Awal Guides</span>
      <h1>Plain answers for building<br>a business that lasts.</h1>
      <p class="guide-lede">What the rules actually say about registering, protecting and running a business in Nigeria, and from wherever you live.</p>
      <div class="guide-search" id="search">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="guide-search" type="search" placeholder="Search guides: e.g. annual returns, TIN, trademark cost" autocomplete="off" aria-label="Search guides">
        <div id="guide-search-results" class="guide-search-results" hidden></div>
      </div>
${chipsRow('', null)}
    </div>
  </section>

  <section class="guide-featured-wrap">
    <div class="container">
      <article class="guide-featured">
        <a class="guide-featured-cover" href="${featured.slug}/" tabindex="-1" aria-hidden="true">${cover(featured)}<span class="chip">${esc(featured.topic.label)}</span><span class="chip chip-right">Featured</span></a>
        <div class="guide-featured-text">
          <h2><a href="${featured.slug}/">${esc(featured.title)}</a></h2>
          <p>${esc(featured.excerpt || featured.description)}</p>
          ${deskByline(featured)}
        </div>
      </article>
      <div class="guide-grid">
${latest.map(p => card(p, '')).join('\n')}
      </div>
    </div>
  </section>

  <section class="section guide-library">
    <div class="container">
${sectionHead('The library', 'Every guide, by subject. Each shelf opens to what is on it.')}
      <div class="shelf-grid">
${hubs.filter(h => !h.featured).flatMap(h => liveTopics(h)).map(t => topicShelf(t, '', { limit: 0 })).join('\n')}
      </div>
    </div>
  </section>
${hubs.filter(h => h.featured && liveTopics(h).length).map(h => `
  <section class="section guide-library">
    <div class="container">
${sectionHead(h.label, h.blurb)}
      <div class="shelf-grid">
${liveTopics(h).map((t, i) => topicShelf(t, '', { open: i < 3, code: t.code })).join('\n')}
      </div>
    </div>
  </section>`).join('')}
${ctaBand(INDEX_ROOT)}`;

fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), fill(pageTemplate, {
  ROOT: INDEX_ROOT,
  PAGE_TITLE: 'Awal Guides: Business, Tax and Compliance Answers for Nigeria | Awal Global Consults',
  META_DESCRIPTION: 'Plain-language guides on CAC registration, TIN and tax, trademarks, SCUML, data protection, immigration and running a Nigerian business from abroad.',
  CANONICAL: `${SITE_URL}/blog/`,
  PAGE_BODY: hubBody,
  PAGE_SCRIPT: SEARCH_SCRIPT
}), 'utf8');
console.log('Built /blog/index.html');

// --- 4. Listing pages: one per topic and one per category --------------------

function listingPage({ root, toBlog, crumbs, eyebrow, title, blurb, list, activeTopic, extra = '' }) {
  return `  <section class="guide-hero guide-hero-sm">
    <div class="container">
      <nav class="guide-crumbs" aria-label="Breadcrumb">${crumbs}</nav>
      <span class="guide-eyebrow"><span class="dot"></span>${esc(eyebrow)}</span>
      <h1>${esc(title)}</h1>
      ${blurb ? `<p class="guide-lede">${esc(blurb)}</p>` : ''}
${chipsRow(toBlog, activeTopic)}
    </div>
  </section>
  <section class="section guide-list">
    <div class="container">
      <div class="guide-grid">
${list.map(p => card(p, toBlog)).join('\n')}
      </div>
${extra}
    </div>
  </section>
${ctaBand(root)}`;
}

// 4a. Topic pages — 3 levels deep (blog/topic/{slug}/) -> ROOT = "../../../"
const TOPIC_ROOT = '../../../';
const liveTopicList = hubs.flatMap(h => liveTopics(h).map(t => ({ topic: t, hub: h })));
liveTopicList.forEach(({ topic, hub }) => {
  const list = postsByTopic[topic.slug];
  const siblings = liveTopics(hub).filter(t => t.slug !== topic.slug);
  const extra = siblings.length ? `      <div class="hub-head" style="margin-top:56px"><h2>More in ${esc(hub.label.toLowerCase())}</h2></div>
      <div class="shelf-grid">
${siblings.map(t => topicShelf(t, '../../')).join('\n')}
      </div>` : '';
  const html = fill(pageTemplate, {
    ROOT: TOPIC_ROOT,
    PAGE_TITLE: `${topic.label}: Guides for Nigeria | Awal Global Consults`,
    META_DESCRIPTION: `${hub.blurb} ${list.length} guide${list.length === 1 ? '' : 's'} on ${topic.label.toLowerCase()} from Awal Global Consults.`,
    CANONICAL: `${SITE_URL}/blog/topic/${topic.slug}/`,
    PAGE_BODY: listingPage({
      root: TOPIC_ROOT, toBlog: '../../', activeTopic: topic.slug,
      crumbs: `<a href="${TOPIC_ROOT}">Home</a><span>&middot;</span><a href="../../">Guides</a><span>&middot;</span><span>${esc(hub.label)}</span>`,
      eyebrow: hub.label, title: topic.label, blurb: hub.blurb, list, extra
    }),
    PAGE_SCRIPT: ''
  });
  const outDir = path.join(BLOG_DIR, 'topic', topic.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
  console.log(`Built /blog/topic/${topic.slug}/index.html`);
});

// 4b. Category pages (older URLs, kept so existing links and search results keep working)
const CATEGORY_ROOT = '../../../';
const usedCategorySlugs = [...new Set(posts.map(p => p.categorySlug))];
usedCategorySlugs.forEach(slug => {
  const cat = categories[slug] || { label: slug, description: '' };
  const html = fill(pageTemplate, {
    ROOT: CATEGORY_ROOT,
    PAGE_TITLE: `${cat.label} | Awal Global Consults Guides`,
    META_DESCRIPTION: cat.description || `Guides on ${cat.label} from Awal Global Consults.`,
    CANONICAL: `${SITE_URL}/blog/category/${slug}/`,
    PAGE_BODY: listingPage({
      root: CATEGORY_ROOT, toBlog: '../../', activeTopic: null,
      crumbs: `<a href="${CATEGORY_ROOT}">Home</a><span>&middot;</span><a href="../../">Guides</a>`,
      eyebrow: 'Guides', title: cat.label, blurb: cat.description, list: posts.filter(p => p.categorySlug === slug)
    }),
    PAGE_SCRIPT: ''
  });
  const outDir = path.join(BLOG_DIR, 'category', slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
  console.log(`Built /blog/category/${slug}/index.html`);
});

// --- 5. Search index and RSS feed -------------------------------------------

fs.writeFileSync(path.join(BLOG_DIR, 'search-index.json'), JSON.stringify(posts.map(p => ({
  t: p.title, d: p.description, c: p.topic.label, u: `${p.slug}/`
}))), 'utf8');
console.log('Built /blog/search-index.json');

const rssItems = posts.map(post => `    <item>
      <title>${esc(post.title)}</title>
      <link>${SITE_URL}/blog/${post.slug}/</link>
      <guid>${SITE_URL}/blog/${post.slug}/</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <category>${esc(post.topic.label)}</category>
      <description><![CDATA[${post.description}]]></description>
    </item>`).join('\n');

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Awal Guides | Awal Global Consults</title>
    <link>${SITE_URL}/blog/</link>
    <description>Guides on CAC registration, trademarks, tax, compliance and immigration in Nigeria.</description>
    <language>en-ng</language>
${rssItems}
  </channel>
</rss>
`;

fs.writeFileSync(path.join(BLOG_DIR, 'rss.xml'), rss, 'utf8');
console.log('Built /blog/rss.xml');

// --- 6. Update root sitemap.xml ----------------------------------------------

const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
let sitemap = fs.readFileSync(sitemapPath, 'utf8');

// Strip any existing /blog/ url blocks so re-running the build never
// duplicates entries.
sitemap = sitemap.replace(/\s*<url>\s*<loc>https:\/\/awalglobal\.com\.ng\/blog\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');

const newest = posts.reduce((d, p) => (p.updated || p.date) > d ? (p.updated || p.date) : d, '');
const urlBlock = (loc, lastmod, freq, priority) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

const blogUrlBlocks = [
  urlBlock(`${SITE_URL}/blog/`, newest, 'weekly', '0.8'),
  ...liveTopicList.map(({ topic }) => urlBlock(`${SITE_URL}/blog/topic/${topic.slug}/`,
    postsByTopic[topic.slug].reduce((d, p) => (p.updated || p.date) > d ? (p.updated || p.date) : d, ''), 'weekly', '0.6')),
  ...usedCategorySlugs.map(slug => urlBlock(`${SITE_URL}/blog/category/${slug}/`,
    posts.filter(p => p.categorySlug === slug).reduce((d, p) => (p.updated || p.date) > d ? (p.updated || p.date) : d, ''), 'weekly', '0.5')),
  ...posts.map(post => urlBlock(`${SITE_URL}/blog/${post.slug}/`, post.updated || post.date, 'monthly', '0.7'))
].join('\n');

sitemap = sitemap.replace('</urlset>', `${blogUrlBlocks}\n</urlset>`);
fs.writeFileSync(sitemapPath, sitemap, 'utf8');
console.log('Updated sitemap.xml with blog URLs');

console.log(`\nDone: built ${posts.length} guide(s) across ${liveTopicList.length} topic${liveTopicList.length === 1 ? '' : 's'}.`);
