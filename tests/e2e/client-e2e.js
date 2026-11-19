// Clients: one page per client with everything on file, and a new service for a returning client
const { chromium } = require('playwright');const fs=require('fs');const S=process.argv[2];const B='http://127.0.0.1:8788';
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const txt=async p=>(await p.textContent('body')).replace(/\s+/g,' ');
(async()=>{const b=await chromium.launch();const a=await b.newPage({viewport:{width:390,height:844}});await a.addInitScript(()=>{try{localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 await a.goto(B+'/admin/login');await a.fill('#email','info@awalglobal.com.ng');await a.click('button[type=submit]');
 const code=emails().filter(e=>/login code/.test(e.subject)).at(-1).subject.match(/(\d{6})/)[1];await a.fill('#code',code);await a.click('button[type=submit]');await a.waitForURL(B+'/admin/');
 // An old client, served before
 const stamp=Date.now()%100000;
 await a.goto(B+'/admin/import');await a.fill('#i-name','Tunde Lawal');await a.fill('#i-phone','0815'+String(stamp).padStart(7,'0'));await a.fill('#i-email',`tunde${stamp}@example.com`);
 await a.fill('#i-service','Business Name Registration');await a.fill('#i-date','2026-01-10');
 await a.click('form[action="/admin/import/one"] button[type=submit]');await a.waitForLoadState();
 const firstCase=a.url().split('?')[0];
 // A quotation on the old case, billed to the business
 await a.goto(firstCase+'?tab=billing');await a.fill('input[name=name]','Lawal Ventures');await a.fill('input[name=address]','12 Allen Avenue, Ikeja');await a.fill('input[name=tin]','12345678-0001');
 await a.fill('input[name=unit_0]','40000');await a.click('.bill-form button[name=send][value="0"]');await a.waitForLoadState();
 // Client page
 await a.goto(firstCase);const clientHref=await a.getAttribute('a.btn[href^="/admin/client/"]','href');await a.goto(B+clientHref);
 let body=await txt(a);
 ok(body.includes('New service for this client'),'client page offers a new service');
 ok(/Billing.*Quotation AGC-QT-/.test(body),'client page lists their quotations');
 ok(body.includes('Details on file')&&body.includes('Lawal Ventures')&&body.includes('12 Allen Avenue'),'client page shows details on file, including how they were billed');
 // Nothing picked: refused
 await a.click('form[action$="/new-case"] button[type=submit]');await a.waitForLoadState();
 ok((await txt(a)).includes('Pick at least one service'),'needs a service');
 // New service from WhatsApp, as an invoice
 await a.check('input[name=services][value="SCUML Registration"]');await a.fill('#nc-note','Hi, I need SCUML for my business now');await a.selectOption('#nc-doc','invoice');
 await a.click('form[action$="/new-case"] button[type=submit]');await a.waitForLoadState();
 body=await txt(a);
 ok(/tab=billing/.test(a.url())&&a.url().split('?')[0]!==firstCase,'opens a new case on the billing tab');
 ok(body.includes('New case opened for this returning client'),'confirms the new case');
 ok(await a.inputValue('.bill-form input[name=name]')==='Lawal Ventures','bills the same business as last time');
 ok(await a.inputValue('.bill-form input[name=address]')==='12 Allen Avenue, Ikeja','same address');
 ok(await a.inputValue('.bill-form input[name=tin]')==='12345678-0001','same TIN');
 ok(await a.inputValue('.bill-form select[name=kind]')==='invoice','invoice chosen');
 ok(await a.inputValue('.bill-form input[name=desc_0]')==='SCUML Registration'&&await a.inputValue('.bill-form input[name=unit_0]')==='70000','service line with its starting price');
 await a.click('.bill-form button[name=send][value="1"]');await a.waitForLoadState();
 ok(emails().some(e=>/Your invoice AGC-INV-/.test(e.subject)&&JSON.stringify(e).includes(`tunde${stamp}@example.com`)),'invoice emailed to the returning client');
 const newCase=a.url().split('?')[0];
 await a.goto(newCase+'?tab=activity');ok((await txt(a)).includes('Opened for a returning client (asked by WhatsApp)'),'activity notes the returning client');
 await a.goto(newCase+'?tab=details').catch(()=>{});
 // Back on the client page: both cases, both documents
 await a.goto(B+clientHref);body=await txt(a);
 ok((body.match(/AGC-2026-\d{4}/g)||[]).length>=2&&body.includes('SCUML Registration'),'client page lists both cases');
 ok(/Invoice AGC-INV-/.test(body)&&/Outstanding ₦70,000/.test(body),'client page shows the invoice and what is owed');
 await a.screenshot({path:S+'/client-page.png',fullPage:true});
 // An erased-style guard: unknown service names are ignored
 const r=await a.evaluate(async u=>{const f=new FormData();f.append('services','Nonsense');const x=await fetch(u,{method:'POST',body:f});return x.url},B+clientHref+'/new-case');
 ok(/client_case_none/.test(r),'unknown service names are ignored');
 await b.close();})().catch(e=>{console.log('ERR',e.message.split('\n')[0]);process.exit(1)});
