// Awal Filing Assistant side panel. Reads a case's filing pack from the dashboard (read-only key)
// and fills the portal page beside it. Never submits anything.
const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.flat().forEach(k => k != null && e.append(k)); return e; };

let cfg = { key: '', base: 'https://awalglobal.com.ng', learned: {}, files: {}, limit: '1048576', lastCase: '' };
let pack = null;
let tab = null;

// ── Settings ──────────────────────────────────────────────
async function load() {
  const s = await chrome.storage.local.get(['key', 'base', 'learned', 'files', 'limit', 'lastCase']);
  cfg = { ...cfg, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v != null)) };
}
const save = patch => { Object.assign(cfg, patch); return chrome.storage.local.set(patch); };

async function api(path) {
  const r = await fetch(cfg.base.replace(/\/+$/, '') + '/admin/api/' + path, { headers: { Authorization: 'Bearer ' + cfg.key }, credentials: 'omit' });
  if (r.status === 401) { showSetup('This browser was disconnected. Paste a new connection key.'); throw new Error('Not connected'); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'The dashboard did not answer (' + r.status + ')');
  return r;
}

function showSetup(message) {
  $('main').hidden = true; $('setup').hidden = false;
  $('base').value = cfg.base; $('setup-msg').textContent = message || ''; $('setup-msg').className = 'msg' + (message ? ' err' : '');
}
async function showMain() {
  $('setup').hidden = true; $('main').hidden = false;
  $('limit').value = cfg.limit;
  try { const who = await (await api('whoami')).json(); $('who').textContent = who.label; } catch (e) { return; }
  if (cfg.lastCase) openCase(cfg.lastCase).catch(() => searchCases(''));
  else searchCases('');
}

$('connect').addEventListener('click', async () => {
  const key = $('key').value.trim(), base = $('base').value.trim() || 'https://awalglobal.com.ng';
  if (!/^agcx_/.test(key)) { $('setup-msg').textContent = 'That does not look like a connection key (it starts with agcx_).'; $('setup-msg').className = 'msg err'; return; }
  if (base !== 'https://awalglobal.com.ng') {
    const ok = await chrome.permissions.request({ origins: [new URL(base).origin + '/*'] });
    if (!ok) return;
  }
  await save({ key, base });
  $('key').value = '';
  showMain();
});
$('disconnect').addEventListener('click', async () => { await save({ key: '', lastCase: '' }); pack = null; showSetup(''); });
$('limit').addEventListener('change', () => save({ limit: $('limit').value }));

// ── Cases ─────────────────────────────────────────────────
let timer = null;
$('q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => searchCases($('q').value), 250); });
async function searchCases(q) {
  const box = $('results');
  try {
    const { cases } = await (await api('cases?q=' + encodeURIComponent(q.trim()))).json();
    box.replaceChildren(...(cases.length ? cases.map(c => el('button', { onclick: () => openCase(c.id) },
      el('b', { textContent: c.reference }), ' ', c.name, el('div', { className: 'muted small', textContent: c.services || '' })))
      : [el('p', { className: 'muted small', textContent: q ? 'No open application matches.' : 'No open applications.' })]));
  } catch (e) { box.replaceChildren(el('p', { className: 'msg err', textContent: e.message })); }
}
$('change').addEventListener('click', () => { $('case').hidden = true; $('picker').hidden = false; pack = null; save({ lastCase: '' }); $('q').focus(); });

async function openCase(id) {
  pack = await (await api('filing/' + id)).json();
  await save({ lastCase: id });
  $('picker').hidden = true; $('case').hidden = false;
  $('c-ref').textContent = pack.reference; $('c-name').textContent = pack.client.name;
  $('c-svc').textContent = pack.services.map(s => s.service + ' (' + s.agency.replace(/^the /, '') + ')').join(', ');
  const gaps = [...(pack.missing.details || []), ...(pack.missing.documents || [])];
  $('missing').hidden = !gaps.length;
  $('missing').textContent = gaps.length ? 'Still missing: ' + gaps.join('; ') : '';
  $('person').replaceChildren(...(pack.people.length ? pack.people.map(p => el('option', { value: p.index, textContent: 'Person ' + p.index + ': ' + p.name + (p.role ? ' (' + p.role + ')' : '') }))
    : [el('option', { value: '', textContent: 'No people on this case' })]));
  $('fill-person').disabled = !pack.people.length;
  renderValues(); renderDocs(); status('');
}

function valueRow(f, scope, person) {
  const row = el('div', { className: 'val', title: 'Click into a box on the page, then click here to put this value there' },
    el('span', { className: 'k', textContent: f.label + (f.hint ? ' (' + f.hint + ')' : '') }),
    el('span', { className: 'v', textContent: f.value }),
    el('button', { className: 'ghost sm c', textContent: 'Copy', onclick: e => { e.stopPropagation(); navigator.clipboard.writeText(f.value).then(() => flash(e.target, 'Copied')); } }));
  row.addEventListener('click', () => fillFocused(f, scope, person, row));
  return row;
}
function renderValues() {
  const groups = pack.sections.map(s => el('details', { className: 'group', open: true }, el('summary', { textContent: s.title }), s.fields.map(f => valueRow(f, 'business'))));
  const people = pack.people.map(p => el('details', { className: 'group' }, el('summary', { textContent: 'Person ' + p.index + ': ' + p.name + (p.role ? ' · ' + p.role : '') }), p.fields.map(f => valueRow(f, 'person', p.index))));
  $('sections').replaceChildren(...groups, ...people);
}
function renderDocs() {
  $('boxes').hidden = true;
  $('docs').replaceChildren(...(pack.documents.length ? pack.documents.map(d => el('div', { className: 'doc' },
    el('div', {}, el('b', { textContent: d.portal_name }), el('span', { textContent: d.what + ' · ' + Math.max(1, Math.round(d.size_bytes / 1024)) + ' KB' })),
    el('button', { className: 'gold sm', textContent: 'Attach', onclick: e => attachDoc(d, e.target) })))
    : [el('p', { className: 'muted small', textContent: 'No documents on this case yet.' })]));
}

// ── The page beside the panel ─────────────────────────────
async function refreshTab() { [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); }
chrome.tabs.onActivated.addListener(refreshTab);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.url || info.status === 'complete') refreshTab(); });
chrome.windows.onFocusChanged.addListener(refreshTab);
const host = () => { try { return new URL(tab.url).host; } catch (e) { return ''; } };

/**
 * Get access to the page and load the filler into it. permissions.request is called first,
 * straight from the click, so Chrome accepts it as the user's own action.
 */
async function withPage(fn) {
  if (!tab || !/^https?:/.test(tab.url || '')) { status('Open the portal page in this window first.', 'err'); return; }
  const origin = new URL(tab.url).origin + '/*';
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) { status('Allow the assistant on ' + host() + ' to fill this page.', 'err'); return; }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['filler.js'] });
    return await fn();
  } catch (e) { status('Could not reach the page: ' + (e.message || e), 'err'); }
}
async function run(msg, frameIds) {
  const res = await chrome.scripting.executeScript({
    target: frameIds ? { tabId: tab.id, frameIds } : { tabId: tab.id, allFrames: true },
    func: m => (window.__agcFiller ? window.__agcFiller.handle(m) : null), args: [msg]
  });
  return res.filter(r => r.result != null);
}

function valuesFor(scope, personIndex) {
  const out = {};
  if (scope === 'person') { const p = pack.people.find(x => String(x.index) === String(personIndex)); (p ? p.fields : []).forEach(f => { out[f.key] = f.value; }); }
  else pack.sections.forEach(s => s.fields.forEach(f => { out[f.key] = f.value; }));
  return out;
}
async function learn(signature, key, scope) {
  if (!signature || signature === '|') return;
  const learned = { ...cfg.learned }; const h = host();
  learned[h] = { ...(learned[h] || {}), [signature]: { key, scope } };
  await save({ learned });
}

function fillFocused(f, scope, person, row) {
  withPage(async () => {
    const spots = (await run({ type: 'focused' })).filter(r => r.result).sort((a, b) => b.result.at - a.result.at);
    if (!spots.length) { status('Click into a box on the page first, then click the value here.', 'err'); return; }
    const [r] = await run({ type: 'fillFocused', value: f.value }, [spots[0].frameId]);
    if (r && r.result && r.result.ok) {
      row.classList.add('done');
      await learn(r.result.signature, f.key, scope);
      status('Put “' + f.label + '” into ' + (r.result.label || 'the box') + '. Remembered for next time.', 'ok');
    } else status('That box did not accept the value. If it is a list, pick the option yourself.', 'err');
  });
}
function fillPage(scope) {
  const person = $('person').value;
  withPage(async () => {
    const values = valuesFor(scope, person);
    const results = await run({ type: 'fillPage', scope, values, learned: cfg.learned[host()] || {} });
    const filled = results.flatMap(r => r.result.filled), skipped = results.flatMap(r => r.result.skipped);
    status(filled.length
      ? 'Filled ' + filled.length + ' box' + (filled.length === 1 ? '' : 'es') + ' (outlined in gold). Check each one.' + (skipped.length ? ' Not filled: ' + skipped.slice(0, 6).join(', ') + '.' : '')
      : 'No empty boxes recognised on this page. Click into a box, then click a value to teach it.', filled.length ? 'ok' : 'err');
  });
}
$('fill-business').addEventListener('click', () => fillPage('business'));
$('fill-person').addEventListener('click', () => fillPage('person'));
$('clear').addEventListener('click', () => withPage(async () => { await run({ type: 'clearMarks' }); status(''); }));

// ── Documents ─────────────────────────────────────────────
async function shrink(blob, limit) {
  const bmp = await createImageBitmap(blob);
  let scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  for (let round = 0; round < 8; round++) {
    const cv = el('canvas', { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    for (let q = 0.9; q >= 0.5; q -= 0.1) {
      const out = await new Promise(res => cv.toBlob(res, 'image/jpeg', q));
      if (out && out.size <= limit) return out;
    }
    scale *= 0.8;
  }
  return null;
}
const toBase64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

function attachDoc(d, btn) {
  withPage(async () => {
    const boxes = (await run({ type: 'fileBoxes' })).flatMap(r => r.result.map(b => ({ ...b, frameId: r.frameId })));
    if (!boxes.length) { status('No upload boxes on this page.', 'err'); return; }
    const remembered = (cfg.files[host()] || {})[d.short];
    const known = remembered && boxes.find(b => b.signature === remembered);
    if (known) return attachTo(d, known, btn);
    // Ask which box, once; remembered for this kind of document on this portal
    $('boxes').hidden = false;
    $('boxes').replaceChildren(el('div', { className: 'small', textContent: 'Which upload box is “' + d.what + '” for?' }),
      ...boxes.map(b => el('button', { textContent: b.label + (b.hasFile ? ' (has a file)' : ''), onclick: () => { $('boxes').hidden = true; attachTo(d, b, btn); } })),
      el('button', { className: 'link small', textContent: 'Cancel', onclick: () => { $('boxes').hidden = true; } }));
  });
}
async function attachTo(d, box, btn) {
  btn.disabled = true; status('Attaching ' + d.portal_name + '…');
  try {
    let blob = await (await api('doc/' + d.id)).blob();
    let name = d.portal_name, type = blob.type || 'application/octet-stream';
    const limit = Number(cfg.limit) || 0;
    if (limit && blob.size > limit && /\.(jpg|jpeg|png)$/i.test(name)) {
      const small = await shrink(blob, limit).catch(() => null);
      if (small) { blob = small; type = 'image/jpeg'; name = name.replace(/\.(png|jpeg)$/i, '.jpg'); }
    }
    const [r] = await run({ type: 'attach', index: box.index, name, mime: type, base64: await toBase64(blob) }, [box.frameId]);
    if (r && r.result && r.result.ok) {
      const files = { ...cfg.files, [host()]: { ...(cfg.files[host()] || {}), [d.short]: box.signature } };
      await save({ files });
      status('Attached ' + name + ' (' + Math.round(blob.size / 1024) + ' KB) to ' + (r.result.label || 'the upload box') + '. Check it shows on the page.' + (limit && blob.size > limit ? ' It is over the size limit.' : ''), limit && blob.size > limit ? 'err' : 'ok');
    } else status((r && r.result && r.result.error) || 'The page did not accept the file. Download it from the dashboard and attach it by hand.', 'err');
  } catch (e) { status(e.message, 'err'); }
  finally { btn.disabled = false; }
}

// ── Small helpers ─────────────────────────────────────────
function status(text, kind) { $('status').textContent = text; $('status').className = 'msg' + (kind ? ' ' + kind : ''); }
function flash(btn, text) { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1200); }

(async () => {
  await load(); await refreshTab();
  if (cfg.key) showMain(); else showSetup('');
})();
