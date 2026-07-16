#!/usr/bin/env node
/**
 * Blog build script — no npm dependencies required.
 *
 * What it does:
 *   1. Reads every .md file in blog/_src/content/
 *   2. Parses frontmatter + markdown body
 *   3. Renders each post into blog/{slug}/index.html using
 *      blog/_src/templates/post.html
 *   4. Rebuilds blog/index.html (the listing page, all posts) and
 *      blog/category/{slug}/index.html (one per category) using
 *      blog/_src/templates/index.html
 *   5. Rebuilds blog/rss.xml
 *   6. Updates the root sitemap.xml — replaces any existing /blog/
 *      entries with the current set, leaves every other entry untouched
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

const ROOT_DIR = path.resolve(__dirname, '..', '..'); // repo root
const CONTENT_DIR = path.join(__dirname, 'content');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const BLOG_DIR = path.join(ROOT_DIR, 'blog');
const SITE_URL = 'https://awalglobal.com.ng';

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

// Rewrite leading-"/" asset/internal links authored in markdown content
// (e.g. "/assets/images/blog/x.svg") into the correct relative form for
// a page rendered `root` levels deep ("../../" etc). Absolute
// http(s) URLs are left untouched.
function rewriteContentPaths(html, root) {
  return html.replace(/((?:src|href))="\/([^"]+)"/g, (m, attr, p) => `${attr}="${root}${p}"`);
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function wordCount(text) {
  return (text.match(/\S+/g) || []).length;
}

// --- 1. Load and parse every post -----------------------------------------

const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));

const posts = files.map(file => {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const { html, toc } = parseMarkdown(body);

  const slug = data.slug || slugify(data.title);
  const category = categories[data.category] || {
    label: data.category || 'Insights',
    relatedService: { href: 'index.html', label: 'Contact Us' }
  };
  const readingTime = Math.max(1, Math.round(wordCount(body) / 200));

  return {
    ...data,
    slug,
    category,
    categorySlug: data.category,
    html,
    toc,
    readingTime,
    dateDisplay: formatDateDisplay(data.date),
    dateIso: new Date(data.date + 'T00:00:00').toISOString()
  };
}).sort((a, b) => new Date(b.date) - new Date(a.date));

if (posts.length === 0) {
  console.log('No posts found in blog/_src/content — nothing to build.');
  process.exit(0);
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
    dateModified: post.dateIso,
    author: { '@type': 'Organization', name: 'Awal Global Consults' },
    publisher: {
      '@type': 'Organization',
      name: 'Awal Global Consults',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/images/logo.png` }
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    image: `${SITE_URL}/assets/images/og-image.jpg`
  }, null, 2);

  const breadcrumbSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog/` },
      { '@type': 'ListItem', position: 3, name: post.title, item: canonical }
    ]
  }, null, 2);

  const contentHtml = rewriteContentPaths(post.html, POST_ROOT);

  const rendered = fill(postTemplate, {
    ROOT: POST_ROOT,
    TITLE: post.title,
    DESCRIPTION: post.description,
    CANONICAL: canonical,
    ARTICLE_SCHEMA: articleSchema,
    BREADCRUMB_SCHEMA: breadcrumbSchema,
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

// --- 3. Render listing pages: all posts + one per category -----------------

const indexTemplate = readTemplate('index.html');

function cardHtml(post, root) {
  return `        <div class="blog-card">
          <span class="blog-card-category">${post.category.label}</span>
          <h3><a href="${root}${post.slug}/">${post.title}</a></h3>
          <p>${post.excerpt || post.description}</p>
          <div class="blog-card-meta">${post.dateDisplay} &middot; ${post.readingTime} min read</div>
        </div>`;
}

const usedCategorySlugs = [...new Set(posts.map(p => p.categorySlug))];

// 3a. Main listing page (blog/index.html) — 1 level deep -> ROOT = "../"
const INDEX_ROOT = '../';
const allFiltersHtml = usedCategorySlugs.map(slug => {
  const cat = categories[slug];
  return `        <a href="category/${slug}/">${cat ? cat.label : slug}</a>`;
}).join('\n');
const allCardsHtml = posts.map(p => cardHtml(p, '')).join('\n'); // siblings, no prefix needed

fs.writeFileSync(
  path.join(BLOG_DIR, 'index.html'),
  fill(indexTemplate, { ROOT: INDEX_ROOT, POST_CARDS: allCardsHtml, CATEGORY_FILTERS: allFiltersHtml }),
  'utf8'
);
console.log('Built /blog/index.html');

// 3b. One category page per used category — 2 levels deep -> ROOT = "../../"
const CATEGORY_ROOT = '../../';
usedCategorySlugs.forEach(slug => {
  const cat = categories[slug] || { label: slug };
  const catPosts = posts.filter(p => p.categorySlug === slug);
  const catCardsHtml = catPosts.map(p => cardHtml(p, '../')).join('\n'); // one level back up to blog/
  const catFiltersHtml = usedCategorySlugs.map(s => {
    const c = categories[s];
    const href = s === slug ? '.' : `../${s}/`;
    return `        <a href="${href}"${s === slug ? ' class="active"' : ''}>${c ? c.label : s}</a>`;
  }).join('\n');

  let rendered = fill(indexTemplate, { ROOT: CATEGORY_ROOT, POST_CARDS: catCardsHtml, CATEGORY_FILTERS: catFiltersHtml });
  // Swap the generic hero copy for category-specific copy
  rendered = rendered
    .replace('Guides on CAC registration, trademarks &amp; compliance', cat.label)
    .replace(
      'Practical, plain-language guidance for founders and businesses navigating registration, IP protection, tax, and regulatory compliance in Nigeria.',
      cat.description || ''
    )
    .replace('<title>Blog | Awal Global Consults</title>', `<title>${cat.label} | Awal Global Consults Blog</title>`)
    .replace(/https:\/\/awalglobal\.com\.ng\/blog\/index\.html/g, `${SITE_URL}/blog/category/${slug}/`);

  const outDir = path.join(BLOG_DIR, 'category', slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), rendered, 'utf8');
  console.log(`Built /blog/category/${slug}/index.html`);
});

// --- 4. RSS feed -------------------------------------------------------------

const rssItems = posts.map(post => `    <item>
      <title>${post.title}</title>
      <link>${SITE_URL}/blog/${post.slug}/</link>
      <guid>${SITE_URL}/blog/${post.slug}/</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <description><![CDATA[${post.description}]]></description>
    </item>`).join('\n');

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Awal Global Consults Blog</title>
    <link>${SITE_URL}/blog/index.html</link>
    <description>Guides on CAC registration, trademarks, tax, and compliance in Nigeria.</description>
    <language>en-ng</language>
${rssItems}
  </channel>
</rss>
`;

fs.writeFileSync(path.join(BLOG_DIR, 'rss.xml'), rss, 'utf8');
console.log('Built /blog/rss.xml');

// --- 5. Update root sitemap.xml ----------------------------------------------

const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
let sitemap = fs.readFileSync(sitemapPath, 'utf8');

// Strip any existing /blog/ url blocks so re-running the build never
// duplicates entries.
sitemap = sitemap.replace(/\s*<url>\s*<loc>https:\/\/awalglobal\.com\.ng\/blog\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');

const today = new Date().toISOString().slice(0, 10);

const blogUrlBlocks = [
  `  <url>\n    <loc>${SITE_URL}/blog/index.html</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
  ...usedCategorySlugs.map(slug => `  <url>\n    <loc>${SITE_URL}/blog/category/${slug}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`),
  ...posts.map(post => `  <url>\n    <loc>${SITE_URL}/blog/${post.slug}/</loc>\n    <lastmod>${post.date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`)
].join('\n');

sitemap = sitemap.replace('</urlset>', `${blogUrlBlocks}\n</urlset>`);
fs.writeFileSync(sitemapPath, sitemap, 'utf8');
console.log('Updated sitemap.xml with blog URLs');

console.log(`\nDone — built ${posts.length} post(s) across ${usedCategorySlugs.length} categor${usedCategorySlugs.length === 1 ? 'y' : 'ies'}.`);
