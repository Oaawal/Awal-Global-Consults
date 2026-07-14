// Minimal YAML-frontmatter parser. Only supports flat key: value pairs
// (strings), which is all the blog needs. Values can optionally be
// wrapped in quotes.

function parseFrontmatter(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Post is missing frontmatter (--- block at top of file).');
  }
  const [, fmBlock, body] = match;
  const data = {};
  fmBlock.split('\n').forEach(line => {
    if (!line.trim()) return;
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^["'](.*)["']$/, '$1');
    data[key] = value;
  });
  return { data, body: body.trim() };
}

module.exports = { parseFrontmatter };
