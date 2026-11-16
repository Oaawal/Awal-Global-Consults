const { chromium, request: pwreq } = require('playwright'); const fs = require('fs'); const { execFileSync } = require('child_process');
const S = process.argv[2]; const B = 'http://127.0.0.1:8788'; const REPO = process.cwd();
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const emails = () => fs.readFileSync(S + '/emails.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
(async () => {
  const { reqKey, DOC_REQUIREMENTS } = await import(REPO + '/functions/_lib/requirements.js');
  const idKey = reqKey(DOC_REQUIREMENTS['Business Name Registration'][0]), photoKey = reqKey(DOC_REQUIREMENTS['Business Name Registration'][1]);
  const api = await pwreq.newContext();
  const file = (name, path, mimeType) => new File([fs.readFileSync(path)], name, { type: mimeType });
  const fields = {
    Full_Name: 'Bisi Lawal', Phone: '08035551234', Email: 'bisi@gmail.com', Services_Requested: 'Business Name Registration, SCUML Registration', Declaration_Accurate: 'Yes', Declaration_Consent: 'Yes', People_Count: '1',
    Person_1_Full_Name: 'Bisi Ayo Lawal', Person_1_Role: 'Sole Proprietor', Person_1_Nationality: 'Nigerian', Person_1_NIN: '12345678901', Person_1_Date_of_Birth: '1991-04-09', Person_1_Gender: 'Female', Person_1_Phone: '08035551234', Person_1_Email: 'bisi@gmail.com', Person_1_Occupation: 'Trader', Person_1_Residential_Address: '3 Adeola Odeku, VI, Lagos',
    Proposed_Name_1: 'Bisi Fabrics', Proposed_Name_2: 'Bisi Textiles', Business_Category: 'Wholesale and Retail Trade; Repair of Motor Vehicles and Motorcycles', Specific_Nature_Of_Business: 'Sale of fabrics', Business_Address: '12 Balogun Street, Lagos Island',
    Signatures: file('signature-1-bisi-ayo-lawal.png', S + '/sig.png', 'image/png'),
    Documents: [file(idKey + '--nin.pdf', S + '/id.pdf', 'application/pdf'), file(photoKey + '--photo.jpg', S + '/bigphoto.jpg', 'image/jpeg')]
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const one of [].concat(v)) fd.append(k, one);
  const r = await api.post(B + '/submit-kyc', { multipart: fd });
  const j = await r.json(); ok(r.status() === 200, 'application submitted ' + (j.reference || JSON.stringify(j)));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const a = await ctx.newPage(); await a.addInitScript(() => { try { localStorage.setItem('agc_app_panel', 'hide') } catch (e) {} });
  await a.goto(B + '/admin/login'); await a.fill('#email', 'info@awalglobal.com.ng'); await a.click('button[type=submit]'); await a.waitForTimeout(500);
  const code = emails().filter(e => /login code/.test(e.subject)).at(-1).subject.match(/(\d{6})/)[1]; await a.fill('#code', code); await a.click('button[type=submit]'); await a.waitForURL(B + '/admin/');
  const caseUrl = emails().filter(e => e.subject.includes(j.reference)).map(e => (e.html || '').match(/\/admin\/case\/[0-9a-f-]{36}/)).filter(Boolean)[0][0];
  const caseId = caseUrl.split('/').pop();

  // 1. Filing pack tab
  await a.goto(B + caseUrl + '?tab=filing');
  const t = (await a.textContent('body')).replace(/\s+/g, ' ');
  ok(t.includes('Proposed name (1st choice)') && t.includes('Bisi Fabrics') && t.includes('Nature of business category'), 'business section with names and category');
  ok(t.includes('Surname') && t.includes('Lawal') && t.includes('09/04/1991') && t.includes('Other names') && t.includes('Ayo'), 'person split into surname / first / other with day-first date');
  ok(t.includes(j.reference + '-ID.pdf') && t.includes(j.reference + '-Passport-Photo.jpg') && t.includes(j.reference + '-Signature-Bisi-Ayo-Lawal.png'), 'documents renamed for the portal');
  ok(/missing/i.test(t) && t.includes('Proof of business address'), 'checklist shows what is still missing (SCUML proof of address)');
  await a.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await a.click('.fp-row:has-text("Proposed name (1st choice)") .fp-copy');
  ok((await a.evaluate(() => navigator.clipboard.readText())) === 'Bisi Fabrics', 'copy button copies the value');
  await a.click('[data-copy-all="fp-person-1"]');
  ok((await a.evaluate(() => navigator.clipboard.readText())).includes('NIN: 12345678901'), 'copy all copies label: value lines');
  await a.selectOption('#fp-limit', '512000');
  const [dl] = await Promise.all([a.waitForEvent('download'), a.click('#fp-zip')]);
  await dl.saveAs(S + '/fp.zip'); const list = execFileSync('unzip', ['-l', S + '/fp.zip']).toString();
  ok(list.includes(j.reference + '-ID.pdf') && list.includes(j.reference + '-Passport-Photo.jpg') && list.includes(j.reference + '-Signature-Bisi-Ayo-Lawal.png'), 'zip has the renamed files');
  const photoSize = Number((list.split('\n').find(l => l.includes('Passport-Photo')) || '').trim().split(/\s+/)[0]);
  ok(photoSize > 0 && photoSize <= 512000, 'big photo shrunk under 500 KB in the zip (' + photoSize + ' bytes, was 3.9MB)');
  execFileSync('unzip', ['-o', '-q', S + '/fp.zip', '-d', S + '/fpzip']); ok(fs.readFileSync(S + '/fpzip/' + j.reference + '-ID.pdf').slice(0, 5).toString() === '%PDF-', 'zip opens and files are intact');
  ok((await a.textContent('#fp-zip-status')).includes('Downloaded 3 files'), 'status: ' + await a.textContent('#fp-zip-status'));
  await a.screenshot({ path: S + '/fp-tab.png', fullPage: true });
  const docId = await a.getAttribute('.fp-doc[data-doc-name$="-ID.pdf"]', 'data-doc-id'); const cd = await a.evaluate(async u => (await fetch(u)).headers.get('content-disposition'), '/admin/doc/' + docId + '?download=' + encodeURIComponent(j.reference + '-ID.pdf'));
  ok(/attachment; filename="AGC-[^"]+-ID\.pdf"/.test(cd || ''), 'single download uses the portal name: ' + cd);

  // 2. Extension key + API
  await a.goto(B + '/admin/extension'); await a.fill('input[name=label]', 'Test Chrome'); await a.click('form[action="/admin/extension/key"] button');
  const key = await a.inputValue('input[aria-label="Connection key"]'); ok(/^agcx_/.test(key), 'connection key shown once');
  await a.screenshot({ path: S + '/ext-page.png', fullPage: true });
  const h = { Authorization: 'Bearer ' + key };
  let x = await api.get(B + '/admin/api/whoami', { headers: h }); ok(x.status() === 200 && (await x.json()).label === 'Test Chrome', 'API accepts the key');
  x = await api.get(B + '/admin/api/whoami', { headers: { Authorization: 'Bearer agcx_wrongwrongwrongwrongwrong' } }); ok(x.status() === 401, 'wrong key refused');
  x = await api.get(B + '/admin/api/whoami'); ok(x.status() === 401, 'no key refused (cookies not used)');
  x = await api.get(B + '/admin/api/cases?q=Bisi', { headers: h }); const cs = (await x.json()).cases; ok(cs.some(c => c.reference === j.reference), 'case search finds the case by name');
  x = await api.get(B + '/admin/api/cases?q=Fabrics', { headers: h }); ok((await x.json()).cases.some(c => c.reference === j.reference), 'case search finds by proposed business name');
  x = await api.get(B + '/admin/api/filing/' + caseId, { headers: h }); const pack = await x.json(); fs.writeFileSync(S + '/pack.json', JSON.stringify(pack, null, 1));
  ok(pack.people[0].fields.find(f => f.key === 'surname').value === 'Lawal' && pack.documents.length === 3, 'filing pack JSON for the extension');
  x = await api.get(B + '/admin/api/doc/' + pack.documents.find(d => d.short === 'ID').id, { headers: h }); ok(x.status() === 200 && (await x.body()).slice(0, 5).toString() === '%PDF-', 'document fetch works with the key');
  x = await api.post(B + '/admin/api/cases', { headers: h }); ok(x.status() === 405 || x.status() === 403, 'API is read only (' + x.status() + ')');

  // 3. Service update: reference + certificate to the client
  await a.goto(B + caseUrl);
  const row = n => a.locator('#services-progress .svc-row', { hasText: n }).first();
  await row('Business Name Registration').locator('summary').click();
  await row('Business Name Registration').locator('select[name=step]').selectOption('delivered');
  await row('Business Name Registration').locator('input[name=ref]').fill('BN 9876543');
  await row('Business Name Registration').locator('input[name=files]').setInputFiles([S + '/id.pdf']);
  await row('Business Name Registration').locator('input[name=notify]').check();
  const n0 = emails().length; await row('Business Name Registration').locator('button[type=submit]').click(); await a.waitForLoadState();
  ok((await a.textContent('body')).includes('client emailed'), 'saved and client emailed');
  ok((await row('Business Name Registration').textContent()).includes('BN 9876543'), 'agency reference shows on the service');
  const em = emails().slice(n0).find(e => /documents are ready/.test(e.subject)); ok(!!em, 'email: ' + (em && em.subject));
  const link = em && (em.html.match(/https?:\/\/[^"]+\/delivered\/[0-9a-f-]{36}\/\d{10}\/[A-Za-z0-9_-]+/) || [])[0];
  ok(!!link && em.html.includes('Reference: BN 9876543'), 'email has a private download link and the reference');
  x = await api.get(link.replace(/^https?:\/\/[^/]+/, B)); ok(x.status() === 200 && /attachment; filename="id\.pdf"/.test(x.headers()['content-disposition']), 'client download link works');
  x = await api.get(link.replace(/^https?:\/\/[^/]+/, B).slice(0, -3) + 'abc'); ok(x.status() === 404, 'tampered link refused');
  const upId = pack.documents.find(d => d.short === 'ID').id; const fake = link.replace(/^https?:\/\/[^/]+/, B).replace(/delivered\/[0-9a-f-]{36}/, 'delivered/' + upId);
  x = await api.get(fake); ok(x.status() === 404, 'cannot fetch client uploads through delivered links');
  await a.goto(B + caseUrl + '?tab=filing'); ok(!(await a.textContent('.fp-docs')).includes('id.pdf') || (await a.$$('.fp-doc')).length === 3, 'delivered certificate is not mixed into the filing documents');

  // 4. Client tracking page
  const c = await b.newPage(); await c.goto(B + '/track'); await c.fill('input[name=reference]', j.reference); await c.fill('input[name=email]', 'bisi@gmail.com'); await c.click('button[type=submit]'); await c.waitForLoadState();
  const tt = (await c.textContent('body')).replace(/\s+/g, ' ');
  ok(tt.includes('Reference BN 9876543') && tt.includes('Your documents') && tt.includes('id.pdf'), 'tracking page shows reference and the document to download');
  await c.screenshot({ path: S + '/track-docs.png', fullPage: true });

  // 5. Revoke
  await a.goto(B + '/admin/extension'); a.on('dialog', d => d.accept()); await a.click('form[action="/admin/extension/revoke"] button'); await a.waitForLoadState();
  x = await api.get(B + '/admin/api/whoami', { headers: h }); ok(x.status() === 401, 'disconnected key stops working');
  fs.writeFileSync(S + '/fp-case.txt', caseId + ' ' + j.reference);
  await b.close();
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
