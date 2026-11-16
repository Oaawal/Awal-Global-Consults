const { chromium } = require('playwright'); const fs = require('fs');
const S = process.argv[2]; const EXT = require('path').join(process.cwd(), 'ops/filing-extension/awal-filing-assistant');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const pack = JSON.parse(fs.readFileSync(S + '/pack.json'));
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + S + '/mockportal.html'); await p.addScriptTag({ path: EXT + '/filler.js' });
  const vals = {}; pack.sections.forEach(s => s.fields.forEach(f => vals[f.key] = f.value));
  let r = await p.evaluate(v => window.__agcFiller.handle({ type: 'fillPage', scope: 'business', values: v, learned: {} }), vals);
  const v = id => p.inputValue('#' + id);
  ok(await v('pn1') === 'Bisi Fabrics' && await v('pn2') === 'Bisi Textiles', 'proposed names filled');
  ok(await v('cat') === '44', 'category picked from the list');
  ok(await v('desc') === 'Sale of fabrics', 'business activity description');
  ok(await v('addr') === '12 Balogun Street, Lagos Island', 'address found from nearby text');
  ok(await v('em') === 'bisi@gmail.com', 'email');
  ok(await v('cap') === '', 'captcha left alone');
  ok(await v('sn') === '' , 'person boxes untouched by business fill');
  console.log('  filled:', r.filled.length, 'skipped:', r.skipped.join(' / '));
  const pv = {}; pack.people[0].fields.forEach(f => pv[f.key] = f.value);
  r = await p.evaluate(v => window.__agcFiller.handle({ type: 'fillPage', scope: 'person', values: v, learned: {} }), pv);
  ok(await v('sn') === 'Lawal' && await v('fn') === 'Bisi' && await v('on') === 'Ayo', 'names split into boxes');
  ok(await p.isChecked('input[value=F]') && !(await p.isChecked('input[value=M]')), 'Female radio chosen (not Male)');
  ok(await v('dob') === '1991-04-09', 'date box gets YYYY-MM-DD');
  ok(await v('nin') === '12345678901', 'NIN');
  ok(await p.evaluate(() => window.changes.includes('sn') && window.changes.includes('cat')), 'change events fired (frameworks notice)');
  ok(!(await p.evaluate(() => window.submitted)), 'Submit never pressed');
  // learning: click into odd box, fill focused
  await p.focus('#odd');
  r = await p.evaluate(() => window.__agcFiller.handle({ type: 'fillFocused', value: 'Trader' }));
  ok(r.ok && await v('odd') === 'Trader', 'value put into the box the cursor was in');
  const learned = { [r.signature]: { key: 'occupation', scope: 'person' } };
  await p.fill('#odd', '');
  await p.evaluate(v => window.__agcFiller.handle({ type: 'fillPage', scope: 'person', values: v, learned: arguments[0] }), pv).catch(() => {});
  r = await p.evaluate(([v, l]) => window.__agcFiller.handle({ type: 'fillPage', scope: 'person', values: v, learned: l }), [pv, learned]);
  ok(await v('odd') === 'Trader', 'learned box is filled next time');
  // files
  const boxes = await p.evaluate(() => window.__agcFiller.handle({ type: 'fileBoxes' }));
  ok(boxes.length === 2 && /means of identification/.test(boxes[0].label), 'upload boxes listed with labels');
  const b64 = fs.readFileSync(S + '/id.pdf').toString('base64');
  r = await p.evaluate(([i, b64]) => window.__agcFiller.handle({ type: 'attach', index: i, name: 'AGC-ID.pdf', mime: 'application/pdf', base64: b64 }), [boxes[0].index, b64]);
  ok(r.ok && await p.evaluate(() => document.getElementById('f1').files[0].name === 'AGC-ID.pdf' && document.getElementById('f1').files[0].size > 20), 'document attached to the upload box');
  await p.screenshot({ path: S + '/mockportal.png', fullPage: true });
  await p.evaluate(() => window.__agcFiller.handle({ type: 'clearMarks' }));
  ok(await p.evaluate(() => !document.querySelector('[data-agc-outline]')), 'gold outlines removed');
  await b.close();

  // extension loads in Chromium (manifest + side panel page)
  const ctx = await chromium.launchPersistentContext(S + '/extprofile', { channel: 'chromium', headless: true, args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
  ok(!!sw, 'extension installs (service worker running)');
  if (sw) {
    const id = sw.url().split('/')[2]; const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto('chrome-extension://' + id + '/sidepanel.html'); await pg.waitForTimeout(800);
    ok(await pg.isVisible('#setup') && errs.length === 0, 'side panel opens on the connect screen, no errors ' + errs.join(';'));
    await pg.screenshot({ path: S + '/panel-setup.png' });
  }
  await ctx.close();
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
