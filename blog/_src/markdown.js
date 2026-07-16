// Minimal, dependency-free Markdown -> HTML converter.
// Supports: h1-h4, paragraphs, bold/italic, inline code, links,
// unordered/ordered lists, blockquotes, horizontal rules.
// Not a full CommonMark implementation by design (keeps the build
// script dependency-free) — sufficient for long-form article content.

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function inline(text) {
  let out = escapeHtml(text);
  // inline code `code`
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // bold **text**
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // italic *text* (avoid already-consumed ** pairs)
  out = out.replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  // links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => {
    const external = /^https?:\/\//.test(u) && !u.includes('awalglobal.com.ng');
    const attrs = external ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${u}"${attrs}>${t}</a>`;
  });
  return out;
}

// Standalone image line: ![alt](src) optionally followed by "caption: ..." on
// the next line. Returns a <figure> block.
function isImageLine(line) {
  return /^!\[[^\]]*\]\([^)]+\)\s*$/.test(line.trim());
}
function renderImage(line, captionLine) {
  const m = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  const alt = m[1];
  const src = m[2];
  const caption = captionLine ? inline(captionLine.replace(/^caption:\s*/i, '')) : '';
  return `<figure class="blog-figure"><img src="${src}" alt="${escapeHtml(alt)}" loading="lazy">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
}

// Simple pipe-table support:
// | Col A | Col B |
// |-------|-------|
// | val   | val   |
function isTableRow(line) {
  return /^\|.+\|\s*$/.test(line.trim());
}
function isTableSeparator(line) {
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line.trim());
}
function renderTable(rows) {
  const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const header = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  const thead = `<thead><tr>${header.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<div class="blog-table-wrap"><table>${thead}${tbody}</table></div>`;
}

function parseMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let html = [];
  const toc = [];
  let i = 0;

  function flushParagraph(buf) {
    if (buf.length) {
      html.push(`<p>${inline(buf.join(' '))}</p>`);
      buf.length = 0;
    }
  }

  let paraBuf = [];

  while (i < lines.length) {
    const line = lines[i];

    // blank line
    if (/^\s*$/.test(line)) {
      flushParagraph(paraBuf);
      i++;
      continue;
    }

    // horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushParagraph(paraBuf);
      html.push('<hr>');
      i++;
      continue;
    }

    // headings
    const hMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (hMatch) {
      flushParagraph(paraBuf);
      const level = hMatch[1].length;
      const text = hMatch[2].trim();
      const id = slugify(text);
      if (level === 2) toc.push({ id, text });
      html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    // fenced custom blocks: ::: callout / ::: quote / ::: stat
    const fenceMatch = line.trim().match(/^:::\s*(callout|quote|stat)\s*$/i);
    if (fenceMatch) {
      flushParagraph(paraBuf);
      const type = fenceMatch[1].toLowerCase();
      i++;
      const buf = [];
      while (i < lines.length && lines[i].trim() !== ':::') {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing :::
      const inner = buf.join('\n').trim();
      if (type === 'quote') {
        html.push(`<blockquote class="blog-pullquote">${inline(inner)}</blockquote>`);
      } else if (type === 'stat') {
        const [num, ...rest] = inner.split('\n');
        html.push(`<div class="blog-stat"><span class="blog-stat-num">${inline(num)}</span><span class="blog-stat-label">${inline(rest.join(' '))}</span></div>`);
      } else {
        html.push(`<div class="blog-callout"><p>${inline(inner)}</p></div>`);
      }
      continue;
    }

    // image (standalone figure, optionally followed by a caption line)
    if (isImageLine(line)) {
      flushParagraph(paraBuf);
      const next = lines[i + 1];
      const hasCaption = next && /^caption:\s*/i.test(next.trim());
      html.push(renderImage(line, hasCaption ? next.trim() : null));
      i += hasCaption ? 2 : 1;
      continue;
    }

    // table
    if (isTableRow(line) && lines[i + 1] && isTableSeparator(lines[i + 1])) {
      flushParagraph(paraBuf);
      const rows = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      html.push(renderTable(rows));
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      flushParagraph(paraBuf);
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${buf.map(l => `<p>${inline(l)}</p>`).join('')}</blockquote>`);
      continue;
    }

    // unordered list
    if (/^[-*]\s+/.test(line)) {
      flushParagraph(paraBuf);
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      html.push(`<ul>${items.map(it => `<li>${inline(it)}</li>`).join('')}</ul>`);
      continue;
    }

    // ordered list
    if (/^\d+\.\s+/.test(line)) {
      flushParagraph(paraBuf);
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      html.push(`<ol>${items.map(it => `<li>${inline(it)}</li>`).join('')}</ol>`);
      continue;
    }

    // paragraph text (accumulate)
    paraBuf.push(line.trim());
    i++;
  }
  flushParagraph(paraBuf);

  return { html: html.join('\n'), toc };
}

module.exports = { parseMarkdown, slugify, escapeHtml };
