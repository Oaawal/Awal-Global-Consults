const { chromium, request: pwreq } = require('playwright');const fs=require('fs');const S=process.argv[2];const B='http://127.0.0.1:8788';
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
(async()=>{const api=await pwreq.newContext();
 // a quick request for three dependent services (no business details yet, like a WhatsApp client)
 const r=await api.post(B+'/submit-kyc',{multipart:{Intake:'quick',Full_Name:'Chika Eze',Phone:'08031117777',Email:'chika@gmail.com',Services_Requested:'SCUML Registration, TIN Registration & Validation, Limited Company Registration',Declaration_Accurate:'Yes',Declaration_Consent:'Yes'}});
 const ref=(await r.json()).reference;
 const b=await chromium.launch();const a=await b.newPage({viewport:{width:390,height:844}});await a.addInitScript(()=>{try{localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 await a.goto(B+'/admin/login');await a.fill('#email','info@awalglobal.com.ng');await a.click('button[type=submit]');
 const code=emails().filter(e=>/login code/.test(e.subject)).at(-1).subject.match(/(\d{6})/)[1];await a.fill('#code',code);await a.click('button[type=submit]');await a.waitForURL(B+'/admin/');
 const caseUrl=emails().filter(e=>e.subject.includes(ref)).map(e=>(e.html||'').match(/\/admin\/case\/[0-9a-f-]{36}/)).filter(Boolean)[0][0];
 await a.goto(B+caseUrl);
 const order=await a.$$eval('#services-progress .svc-row strong',e=>e.map(x=>x.textContent));
 ok(order.join(' > ')==='Limited Company Registration > TIN Registration & Validation > SCUML Registration','services in working order: '+order.join(' > '));
 const t0=(await a.textContent('#services-progress')).replace(/\s+/g,' ');
 ok(/TIN Registration & Validation.*Waiting for: Limited Company Registration/.test(t0)&&/SCUML Registration.*Waiting for: Limited Company Registration, TIN Registration & Validation/.test(t0),'dependants show what they wait for');
 // move the company to submitted, with client email
 const row=n=>a.locator('#services-progress .svc-row',{hasText:n}).first();
 await row('Limited Company Registration').locator('summary').click();
 await row('Limited Company Registration').locator('select[name=step]').selectOption('submitted');
 await row('Limited Company Registration').locator('input[name=note]').fill('CAC ref 1234567');
 await row('Limited Company Registration').locator('input[name=notify]').check();
 let n0=emails().length;await row('Limited Company Registration').locator('button[type=submit]').click();await a.waitForLoadState();
 ok((await a.textContent('body')).includes('Service updated and the client emailed'),'step saved and client emailed');
 const em=emails().slice(n0).find(e=>/Limited Company Registration/.test(e.subject));ok(em&&em.html.includes('submitted to CAC'),'client email: '+(em&&em.subject));
 ok((await row('Limited Company Registration').textContent()).includes('Submitted to CAC')&&(await row('Limited Company Registration').textContent()).includes('CAC ref 1234567'),'company shows Submitted to CAC with the note');
 // SCUML moved early: allowed with a note
 await row('SCUML Registration').locator('summary').click();await row('SCUML Registration').locator('select[name=step]').selectOption('submitted');await row('SCUML Registration').locator('button[type=submit]').click();await a.waitForLoadState();
 ok((await a.textContent('body')).includes('before the services it depends on were finished'),'moving SCUML early is allowed but flagged');
 // approve company: TIN no longer waits
 await row('Limited Company Registration').locator('summary').click();await row('Limited Company Registration').locator('select[name=step]').selectOption('approved');await row('Limited Company Registration').locator('button[type=submit]').click();await a.waitForLoadState();
 ok(!(await row('TIN Registration & Validation').textContent()).includes('Waiting for'),'TIN ready once the company is approved');
 // business details typed in from WhatsApp
 ok(await a.isVisible('#biz-details [name=f_Proposed_Name_1]'),'business details form is open on the case');
 await a.fill('[name=f_Proposed_Name_1]','Eze Ventures Ltd');await a.fill('[name=f_Proposed_Name_2]','Eze Global Ltd');
 await a.selectOption('[name=f_Business_Category]',{label:'Wholesale and Retail Trade; Repair of Motor Vehicles and Motorcycles'});
 await a.fill('[name=f_Specific_Nature_Of_Business]','Sale of building materials');await a.fill('[name=f_Other_Objects]','Haulage\nImport and export');
 await a.fill('[name=f_Business_Address]','7 Toyin Street, Ikeja, Lagos');await a.fill('[name=f_Share_Capital]','1,000,000');
 await a.click('#biz-details button[type=submit]');await a.waitForLoadState();
 let t=(await a.textContent('body')).replace(/\s+/g,' ');
 ok(t.includes('Business details saved'),'details saved');
 const miss=(await a.textContent('#missing').catch(()=>'')).replace(/\s+/g,' ');
 ok(!/Two proposed names|Nature of business|Business address in Nigeria|Proposed share capital/.test(miss),'those items no longer in Still needed');
 ok(t.includes('Eze Ventures Ltd')&&t.includes('Sale of building materials'),'details show on the case');
 await a.goto(B+caseUrl+'?tab=activity');t=await a.textContent('body');ok(t.includes('Business details entered by the office')&&t.includes('Limited Company Registration: Submitted to CAC'),'activity log records both');
 // client tracking page shows the services
 const c=await b.newPage();await c.goto(B+'/track');await c.fill('input[name=reference]',ref);await c.fill('input[name=email]','chika@gmail.com');await c.click('button[type=submit]');await c.waitForLoadState();
 t=(await c.textContent('body')).replace(/\s+/g,' ');
 ok(t.includes('Your services')&&/Limited Company Registration\s*Approved/.test(t)&&/SCUML Registration\s*Submitted to SCUML/.test(t)&&!t.includes('CAC ref 1234567'),'client sees each service (internal notes hidden)');
 await c.screenshot({path:S+'/track-svc.png',fullPage:true});
 await a.goto(B+caseUrl);await (await a.$('#services-progress')).screenshot({path:S+'/svc-card.png'});
 await b.close();})().catch(e=>{console.log('ERR',e.message.split('\n')[0]);process.exit(1)});
