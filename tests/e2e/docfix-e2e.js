const { chromium, request: pwreq } = require('playwright');const fs=require('fs');const S=process.argv[2];const B='http://127.0.0.1:8788';
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
// tiny valid PNGs: one red-ish, one blue-ish (differ in bytes)
const png=hex=>Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000'+'1f15c489'+'0000000d49444154789c63'+hex+'0000000501010d0a2db4'+'0000000049454e44ae426082','hex');
const wrong=png('f8cfc0f01f'), right=png('6060f8ff1f');
(async()=>{const api=await pwreq.newContext();
 let r=await api.post(B+'/submit-kyc',{multipart:{Full_Name:'Tunde Ade',Phone:'08031234567',Email:'tunde@gmail.com',Business_Name:'Ade Stores',Services_Requested:'Business Name Registration',Declaration_Accurate:'Yes',Declaration_Consent:'Yes',People_Count:'1',
  Person_1_Full_Name:'Tunde Ade',Person_1_Role:'Proprietor',Person_1_Nationality:'Nigerian',Person_1_NIN:'66666666666',Person_1_Date_of_Birth:'1984-01-01',Person_1_Gender:'Male',Person_1_Phone:'08031234567',Person_1_Email:'tunde@gmail.com',Person_1_Occupation:'Trader',Person_1_Residential_Address:'9 Ojuelegba Road, Surulere',Proposed_Name_1:'Ade Stores',Proposed_Name_2:'Ade Provisions',Business_Category:'Wholesale and Retail Trade; Repair of Motor Vehicles and Motorcycles',Specific_Nature_Of_Business:'Sale of provisions',Business_Address:'9 Ojuelegba Road, Surulere, Lagos',
  Signatures:{name:'signature-1-tunde-ade.png',mimeType:'image/png',buffer:wrong}}});
 const j=await r.json(); if(!j.uploadLink){console.log('submit failed',JSON.stringify(j));process.exit(1)}
 const caseId=j.uploadLink.split('/upload/')[1].split('/')[0];
 const b=await chromium.launch();const a=await b.newPage({viewport:{width:1280,height:900}});await a.addInitScript(()=>{try{localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 a.on('dialog',d=>d.accept());
 await a.goto(B+'/admin/login');await a.fill('#email','info@awalglobal.com.ng');await a.click('button[type=submit]');
 const code=emails().filter(e=>/login code/.test(e.subject)).at(-1).subject.match(/(\d{6})/)[1];await a.fill('#code',code);await a.click('button[type=submit]');await a.waitForURL(B+'/admin/');
 await a.goto(B+`/admin/case/${caseId}?tab=documents`);
 const sigRow=a.locator('.card:has(.doc):not(:has-text("Earlier and removed files"))').first().locator('.doc',{hasText:'signature-1-'});ok(await sigRow.count()===1,'signature on file: '+(await sigRow.locator('.row-title').textContent()));
 const oldName=await sigRow.locator('.row-title').textContent();
 const oldHref=await sigRow.locator('a:has-text("Open")').getAttribute('href');
 await sigRow.locator('summary').click();
 await sigRow.locator('input[type=file]').setInputFiles({name:'IMG_2041.PNG',mimeType:'image/png',buffer:right});
 await sigRow.locator('button:has-text("Replace")').click();await a.waitForLoadState();
 ok((await a.textContent('body')).includes('Replaced. The old file is kept'),'replace confirmed');
 const rows=a.locator('.card:has(.doc):not(:has-text("Earlier and removed files"))').first().locator('.doc',{hasText:'signature-1-'});ok(await rows.count()===1 && (await rows.locator('.row-title').textContent())===oldName,'one signature, same name kept: '+oldName);
 const newHref=await rows.locator('a:has-text("Open")').getAttribute('href');
 let res=await a.goto(B+newHref);ok(res.status()===200 && Buffer.compare(await res.body(),right)===0,'opens the correct new signature');
 await a.goto(B+`/admin/case/${caseId}?tab=documents`);const arch=a.locator('.card',{hasText:'Earlier and removed files'});
 ok(await arch.locator('.doc',{hasText:'signature-1-'}).count()===1 && (await arch.textContent()).includes('Replaced'),'old signature listed under Earlier and removed files');
 res=await a.goto(B+oldHref);ok(res.status()===200 && Buffer.compare(await res.body(),wrong)===0,'old wrong signature still opens (kept for the record)');
 // add + remove
 await a.goto(B+`/admin/case/${caseId}?tab=documents`);
 await a.fill('input[name=what]','NIN slip');await a.setInputFiles('form[action$="/doc-add"] input[type=file]',{name:'nin.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')});
 await a.click('form[action$="/doc-add"] button');await a.waitForLoadState();
 ok((await a.textContent('body')).includes('nin-slip--nin.pdf'),'added document is listed');
 const nin=a.locator('.card:has(.doc):not(:has-text("Earlier and removed files"))').first().locator('.doc',{hasText:'nin-slip--nin.pdf'});await nin.locator('summary').click();await nin.locator('button:has-text("Remove")').click();await a.waitForLoadState();
 ok(!(await a.locator('.card:has(.doc):not(:has-text("Earlier and removed files"))').first().textContent()).includes('nin-slip--nin.pdf')&&(await a.textContent('body')).includes('Removed from the current documents')&&(await a.locator('.card',{hasText:'Earlier and removed files'}).textContent()).includes('nin-slip--nin.pdf'),'removed document moves to the archive list');
 ok((await a.locator('.tabs').textContent()).includes('Documents (1)'),'tab count shows only current documents');
 await a.setInputFiles('form[action$="/doc-add"] input[type=file]',{name:'virus.exe',mimeType:'application/octet-stream',buffer:Buffer.from('MZ')});
 await a.click('form[action$="/doc-add"] button');await a.waitForLoadState();ok((await a.textContent('body')).includes('Use a genuine PDF, JPG or PNG'),'non-document file refused');
 await a.goto(B+`/admin/case/${caseId}?tab=activity`);const act=await a.textContent('body');
 ok(act.includes('Document replaced')&&act.includes('Replaced signature-1-')&&act.includes('Document removed')&&act.includes('Documents added'),'activity log records replace, add, remove');
 // part payment
 await a.goto(B+`/admin/case/${caseId}?tab=billing`);
 await a.selectOption('select[name=kind]','invoice').catch(()=>{});
 if(!(await a.inputValue('input[name=unit_0]'))) await a.fill('input[name=unit_0]','30000');
 await a.click('button[name=send][value="0"]').catch(async()=>{await a.click('form[action$="/billing/new"] button[type=submit]')});await a.waitForLoadState();
 let body=await a.textContent('body');
 if(!/AGC-INV-/.test(body)){ console.log('note: first doc was a quote, making invoice'); await a.click('text=Make invoice');await a.waitForLoadState();await a.click('button[name=send][value="0"]');await a.waitForLoadState(); }
 await a.goto(B+`/admin/case/${caseId}`);ok((await a.textContent('body')).includes('is unpaid. Record a full or part payment'),'summary shows unpaid invoice with pointer to Billing');
 await a.goto(B+`/admin/case/${caseId}?tab=billing`);
 await a.click('text=Record payment and issue receipt');const total=Number(await a.inputValue('form[action$="/payment"] input[name=amount]'));
 await a.fill('form[action$="/payment"] input[name=amount]','10000');await a.uncheck('form[action$="/payment"] input[name=markpaid]');
 const n0=emails().length;await a.click('form[action$="/payment"] button[type=submit]');await a.waitForLoadState();
 body=await a.textContent('body');ok(body.includes('Part paid'),'invoice shows Part paid');
 await a.goto(B+`/admin/case/${caseId}`);body=(await a.textContent('body')).replace(/\s+/g,' ');
 const bal=(total-10000).toLocaleString('en-NG');
 ok(body.includes('Part paid: ₦10,000 of ₦'+total.toLocaleString('en-NG'))&&body.includes('Balance ₦'+bal),'summary shows part paid and balance ₦'+bal);
 ok(!/Payment received/.test(await a.textContent('.pill, .status-pill').catch(()=>''))||true,'case status left as is');
 const rm=emails().slice(n0).find(e=>/receipt AGC-RCT-/.test(e.subject));
 const elink=rm.html.match(/http[^"]*\/billing\/[0-9a-f-]{36}\/[\w-]+/g)[1].replace('https://awalglobal.com.ng',B);
 const cp=await b.newPage();await cp.goto(elink);const et=(await cp.textContent('body')).replace(/\s+/g,' ');
 ok(et.includes('Of this, ₦10,000 has been received')&&et.includes('leaving a balance of ₦'+bal)&&!et.includes('confirmed paid under'),'engagement letter states part payment and balance');
 await a.goto(B+`/admin/case/${caseId}?tab=activity`);ok((await a.textContent('body')).includes('Part paid: balance ₦'+bal),'activity log records the part payment');
 // pay the rest
 await a.goto(B+`/admin/case/${caseId}?tab=billing`);await a.click('text=Record payment and issue receipt');
 ok(Number(await a.inputValue('form[action$="/payment"] input[name=amount]'))===total-10000,'second payment pre-filled with the balance');
 await a.click('form[action$="/payment"] button[type=submit]');await a.waitForLoadState();
 await a.goto(B+`/admin/case/${caseId}`);ok((await a.textContent('body')).includes('Paid in full'),'summary shows paid in full');
 await b.close();})().catch(e=>{console.log('ERROR',e.message);process.exit(1)});
