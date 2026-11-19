// Editing a quotation or invoice after a negotiation, then re-sharing it
const { chromium } = require('playwright');const fs=require('fs');const {execSync}=require('child_process');const S=process.argv[2];const B='http://127.0.0.1:8788';
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const txt=async p=>(await p.textContent('body')).replace(/\s+/g,' ');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true});const a=await ctx.newPage();await a.addInitScript(()=>{try{localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 await a.goto(B+'/admin/login');await a.fill('#email','info@awalglobal.com.ng');await a.click('button[type=submit]');
 const code=emails().filter(e=>/login code/.test(e.subject)).at(-1).subject.match(/(\d{6})/)[1];await a.fill('#code',code);await a.click('button[type=submit]');await a.waitForURL(B+'/admin/');
 const stamp=Date.now()%100000;
 await a.goto(B+'/admin/import');await a.fill('#i-name','Grace Eze');await a.fill('#i-phone','0816'+String(stamp).padStart(7,'0'));await a.fill('#i-email',`grace${stamp}@example.com`);
 await a.fill('#i-service','Limited Company Registration');await a.fill('#i-date','2026-02-10');
 await a.click('form[action="/admin/import/one"] button[type=submit]');await a.waitForLoadState();
 const cs=a.url().split('?')[0];
 // First quotation: 150,000
 await a.goto(cs+'?tab=billing');await a.fill('input[name=desc_0]','Limited Company Registration');await a.fill('input[name=unit_0]','150000');
 await a.click('.bill-form button[name=send][value="1"]');await a.waitForLoadState();
 ok(emails().some(e=>/^Your quotation AGC-QT-/.test(e.subject)),'first quotation emailed');
 // Negotiated down: edit
 const edit=a.locator('a.btn:has-text("Edit")').first();ok(await edit.count()===1,'quotation has an Edit button');
 await edit.click();await a.waitForLoadState();let body=await txt(a);
 ok(/Edit quotation AGC-QT-/.test(body),'edit form opens for that quotation');
 ok(await a.inputValue('.bill-form input[name=unit_0]')==='150000','edit form keeps the current price');
 await a.fill('.bill-form input[name=unit_0]','120000');await a.fill('.bill-form textarea[name=notes]','Price agreed on WhatsApp');
 await a.click('.bill-form button[name=send][value="1"]');await a.waitForLoadState();body=await txt(a);
 ok(body.includes('revised document emailed'),'saved and re-sent');
 const rev=emails().filter(e=>/revised quotation/.test(e.subject)).at(-1);
 ok(rev&&/\(Rev\. 1\)/.test(rev.subject)&&JSON.stringify(rev).includes('120,000')&&JSON.stringify(rev).includes('replaces the one we sent earlier'),'client gets the revised quotation with the new total');
 ok((body.match(/AGC-QT-/g)||[]).length>=1&&/\(Rev\. 1\)/.test(body)&&!body.includes('New quotation AGC'),'same number, marked Rev. 1, no second quotation');
 // The document itself
 const docHref=await a.getAttribute('a[href^="/admin/billing/"][target=_blank]','href');await a.goto(B+docHref);body=await txt(a);
 ok(body.includes('Rev. 1')&&body.includes('Revised on')&&body.includes('120,000')&&!body.includes('150,000'),'document shows the revision and new price');
 await a.goto(cs+'?tab=billing');const b64=await a.evaluate(async u=>{const r=await fetch(u);const buf=new Uint8Array(await r.arrayBuffer());let s='';for(const x of buf)s+=String.fromCharCode(x);return btoa(s)},B+docHref+'/pdf');fs.writeFileSync(S+'/rev.pdf',Buffer.from(b64,'base64'));const pt=execSync(`pdftotext ${S}/rev.pdf -`).toString();
 ok(pt.includes('Rev. 1')&&/revised on/i.test(pt)&&pt.includes('120,000'),'PDF shows the revision');
 // Activity keeps the earlier price
 await a.goto(cs+'?tab=activity');body=await txt(a);ok(/revised \(Rev\. 1\): ₦150,000 → ₦120,000/.test(body),'activity records old and new totals');
 // WhatsApp share
 await a.goto(cs+'?tab=billing');const wa=await a.getAttribute('.bill-actions a:has-text("WhatsApp")','href');
 const waText=decodeURIComponent((wa||'').split('text=')[1]||'');
 ok(/^https:\/\/wa\.me\/2348/.test(wa||'')&&waText.includes('revised quotation')&&/\/billing\/[0-9a-f-]{36}\//.test(waText),'WhatsApp button carries the revised document link');
 const link=waText.match(/https?:\/\/\S+/)[0].replace(/^https?:\/\/[^/]+/,B);const pub=await a.evaluate(async u=>(await fetch(u)).text(),link);
 ok(pub.includes('120,000')&&pub.includes('Rev. 1'),'the shared link opens the revised quotation');
 // Invoice, part payment, then an edit below what was paid is refused
 await a.click('a.btn:has-text("Make invoice")');await a.waitForLoadState();await a.click('.bill-form button[name=send][value="0"]');await a.waitForLoadState();
 await a.locator('summary:has-text("Record payment")').first().click();await a.fill('.pay-box input[name=amount]','50000');await a.uncheck('.pay-box input[name=letter]');await a.uncheck('.pay-box input[name=send]');
 await a.click('.pay-box button[type=submit]');await a.waitForLoadState();
 const invEdit=a.locator('.bill-row:has-text("Invoice AGC-INV") a.btn:has-text("Edit")');ok(await invEdit.count()===1,'part-paid invoice can still be edited');
 await invEdit.click();await a.waitForLoadState();ok((await txt(a)).includes('₦50,000 has already been paid'),'edit form warns about the amount paid');
 await a.fill('.bill-form input[name=unit_0]','40000');await a.click('.bill-form button[name=send][value="0"]');await a.waitForLoadState();
 ok((await txt(a)).includes('cannot be less than what the client has already paid'),'cannot go below the amount paid');
 await a.fill('.bill-form input[name=unit_0]','100000');await a.click('.bill-form button[name=send][value="0"]');await a.waitForLoadState();body=await txt(a);
 ok(body.includes('Changes saved')&&/₦100,000 · paid ₦50,000 · balance ₦50,000/.test(body),'invoice revised, balance recalculated');
 await a.screenshot({path:S+'/rev-billing.png',fullPage:true});
 // A voided document has no Edit button and cannot be edited by posting directly
 const qid=(await a.getAttribute('a.btn:has-text("Make invoice")','href')).match(/from=([0-9a-f-]+)/)[1];
 await a.evaluate(async u=>{await fetch(u,{method:'POST',body:new FormData()})},B+'/admin/billing/'+qid+'/void');
 const r=await a.evaluate(async([u,id])=>{const f=new FormData();f.append('edit',id);f.append('kind','quote');f.append('desc_0','X');f.append('unit_0','1');const x=await fetch(u,{method:'POST',body:f});return x.url},[cs+'/billing/new',qid]);
 ok(/bill_not_editable/.test(r),'void quotation cannot be edited');
 await b.close();})().catch(e=>{console.log('ERR',e.message.split('\n')[0]);process.exit(1)});
