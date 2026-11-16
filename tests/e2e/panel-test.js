const { chromium } = require('playwright'); const fs = require('fs'); const S = process.argv[2]; const B = 'http://127.0.0.1:8788'; const EXT = require('path').join(process.cwd(), 'ops/filing-extension/awal-filing-assistant');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const emails = () => fs.readFileSync(S + '/emails.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
(async () => {
  const [caseId, ref] = fs.readFileSync(S + '/fp-case.txt', 'utf8').trim().split(' ');
  const b = await chromium.launch(); const a = await b.newPage();
  await a.goto(B + '/admin/login'); await a.fill('#email', 'info@awalglobal.com.ng'); await a.click('button[type=submit]'); await a.waitForTimeout(500);
  const code = emails().filter(e => /login code/.test(e.subject)).at(-1).subject.match(/(\d{6})/)[1]; await a.fill('#code', code); await a.click('button[type=submit]'); await a.waitForURL(B + '/admin/');
  await a.goto(B + '/admin/extension'); await a.fill('input[name=label]', 'Panel test'); await a.click('form[action="/admin/extension/key"] button');
  const key = await a.inputValue('input[aria-label="Connection key"]'); await b.close();

  const ctx = await chromium.launchPersistentContext(S + '/extprofile' + Date.now(), { channel: 'chromium', headless: true, viewport: { width: 380, height: 900 }, args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT] });
  // the panel talks to the live site address; send those calls to the local test server
  await ctx.route('https://awalglobal.com.ng/admin/api/**', async route => {
    const r = await ctx.request.fetch(route.request().url().replace('https://awalglobal.com.ng', B), { headers: route.request().headers() });
    route.fulfill({ response: r });
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('chrome-extension://' + id + '/sidepanel.html');
  await pg.fill('#key', 'nonsense'); await pg.click('#connect'); ok((await pg.textContent('#setup-msg')).includes('starts with agcx_'), 'bad key explained');
  await pg.fill('#key', key); await pg.click('#connect');
  await pg.waitForSelector('#results button', { timeout: 8000 });
  ok((await pg.textContent('#who')) === 'Panel test', 'connected and named');
  await pg.fill('#q', 'Bisi'); await pg.waitForTimeout(900);
  await pg.click('#results button:has-text("' + ref + '")');
  await pg.waitForSelector('#case:not([hidden])');
  const t = (await pg.textContent('#case')).replace(/\s+/g, ' ');
  ok(t.includes(ref) && t.includes('Bisi Fabrics') && t.includes('Person 1: Bisi Ayo Lawal') && t.includes(ref + '-ID.pdf'), 'case loads with values, people and documents');
  ok(t.includes('Still missing'), 'missing items warned');
  await pg.screenshot({ path: S + '/panel-case.png', fullPage: true });
  await pg.reload(); await pg.waitForSelector('#case:not([hidden])', { timeout: 8000 }); ok(true, 'remembers the open case');
  ok(errs.length === 0, 'no errors ' + errs.join(';'));
  await ctx.close();
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
