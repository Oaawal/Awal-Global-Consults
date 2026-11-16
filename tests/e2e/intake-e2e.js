const { chromium } = require('playwright');const fs=require('fs');const S=process.argv[2];const B='http://127.0.0.1:8788';
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const done=p=>p.waitForFunction(()=>getComputedStyle(document.getElementById('success-screen')).display!=='none'||[...document.querySelectorAll('#submit-error,#quick-error')].some(e=>getComputedStyle(e).display!=='none'),null,{timeout:40000});
(async()=>{const b=await chromium.launch();
 // ── Stage 1: quick quotation request on a phone
 const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});await p.addInitScript(()=>{try{localStorage.setItem('agc_consent','granted');sessionStorage.setItem('agc_src','campaign: instagram / social; landed on /cac-registration')}catch(e){}});
 await p.goto(B+'/kyc/?s=company',{waitUntil:'load'});
 ok(await p.isChecked('input[name=svc][value="Limited Company Registration"]'),'service pre-selected from the link');
 await p.screenshot({path:S+'/intake-1.png',fullPage:true});
 await p.click('#quick-start');
 ok(await p.isVisible('#stage-details')&&!(await p.isVisible('input[name=Existing_Registration_Number]')),'quick path shows contact step only');
 ok((await p.textContent('#quick-estimate-lines')).includes('From ₦75,000'),'estimate shown on the quick step');
 await p.click('#quick-btn');ok(await p.isVisible('#fw-fullname.has-err, #fullname.err'),'empty quick form is refused');
 await p.fill('#fullname','Chidi Okeke');await p.fill('#phone','08031112222');await p.fill('#email','chidi@gmail.com');await p.fill('textarea[name=Business_Description]','Logistics company, two directors');
 await p.selectOption('select[name=Heard_About_Us]','Instagram');
 await p.click('#quick-btn');ok((await p.textContent('#quick-error')).includes('tick the box'),'consent is required');
 await p.check('#q-consent');await p.screenshot({path:S+'/intake-2.png',fullPage:true});
 let n0=emails().length;await p.click('#quick-btn');await done(p);
 ok((await p.textContent('#success-screen h2')).includes('Quotation Request Received'),'quick request accepted');
 const ref=(await p.textContent('#s-ref')).trim();ok(/^AGC-/.test(ref),'reference '+ref);
 const adm=emails().slice(n0).find(e=>/New quote request/.test(e.subject));ok(!!adm,'admin alert: '+(adm&&adm.subject));
 const cm=emails().slice(n0).find(e=>e.to[0].email==='chidi@gmail.com');ok(cm&&/itemized quotation within 1 working day/.test(cm.html)&&!/\/upload\//.test(cm.html),'client email promises a quotation, no upload link');
 const caseUrl=adm.html.match(/\/admin\/case\/[0-9a-f-]{36}/)[0];
 // ── Dashboard
 const a=await b.newPage({viewport:{width:1280,height:900}});await a.addInitScript(()=>{try{localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 await a.goto(B+'/admin/login');await a.fill('#email','info@awalglobal.com.ng');await a.click('button[type=submit]');
 const code=emails().filter(e=>/login code/.test(e.subject)).at(-1).subject.match(/(\d{6})/)[1];await a.fill('#code',code);await a.click('button[type=submit]');await a.waitForURL(B+'/admin/');
 await a.goto(B+caseUrl);let body=(await a.textContent('body')).replace(/\s+/g,' ');
 ok(body.includes('Full details not collected yet')&&!body.includes('Still needed'),'case shows the details card instead of a missing list');
 ok(body.includes('Instagram')&&body.includes('campaign: instagram'),'source recorded on the case');
 ok(!/Person 1|NIN/.test(await a.textContent('.kv')),'no personal IDs collected at the quote stage');
 const link=(await a.inputValue('input[aria-label="Full application link"]')).replace('https://awalglobal.com.ng',B);
 n0=emails().length;await a.fill('#df-note','Thank you for your payment.');await a.click('#details-form button[type=submit]');await a.waitForLoadState();
 ok((await a.textContent('body')).includes('Emailed. The client can now complete'),'details form emailed');
 const dm=emails().slice(n0).find(e=>/Complete your application/.test(e.subject));ok(dm&&dm.html.includes('/kyc/?c=')&&dm.html.includes('Thank you for your payment.'),'client email has the private link and the note');
 // ── Stage 2: client completes the full form with the link
 const c=await b.newPage({viewport:{width:1280,height:900}});await c.addInitScript(()=>{try{localStorage.setItem('agc_consent','denied')}catch(e){}});
 let r=await c.goto(B+'/kyc/?c='+link.split('c=')[1].split('&')[0]+'&k=wrongwrongwrongwrongwrongwrong12',{waitUntil:'load'});await c.waitForSelector('#resume-banner',{state:'visible',timeout:15000});
 ok((await c.textContent('#resume-banner')).includes('no longer valid'),'tampered link refused');
 await c.goto(link,{waitUntil:'load'});await c.waitForFunction(()=>document.body.classList.contains('resume'),null,{timeout:15000});
 ok((await c.textContent('#resume-banner')).includes(ref),'resume banner shows '+ref);
 ok(await c.inputValue('#fullname')==='Chidi Okeke'&&await c.isChecked('input[name=svc][value="Limited Company Registration"]')&&!(await c.isVisible('#quick-start')),'contact details and service pre-filled; quick option hidden');
 await c.click('#full-start');await c.click('#stage-details .btn-next.full-only');await c.fill('#name1','Okeke Logistics');await c.fill('#name2','Okeke Haulage');await c.selectOption('#biz-category',{label:'Transportation'});await c.fill('#biz-nature','Logistics and haulage');await c.fill('#biz-address','5 Marina Road, Lagos');await c.click('#stage-business .btn-next');
 let n=0; while (await c.$(`#p${n+1}-name`)) n++;
 const fill=async i=>{await c.fill(`#p${i}-name`,i===1?'Chidi Okeke':'Ada Okeke');await c.selectOption(`#p${i}-role`,{label:'Director & Shareholder'});await c.fill(`#p${i}-nin`,String(i).repeat(11));await c.fill(`#p${i}-dob`,'1985-02-0'+i);await c.selectOption(`#p${i}-gender`,{index:1});await c.fill(`#p${i}-phone`,'0803111222'+i);await c.fill(`#p${i}-email`,`p${i}@gmail.com`);await c.fill(`#p${i}-occupation`,'Director');await c.fill(`#p${i}-address`,'5 Marina Road, Lagos');const sh=await c.$(`#p${i}-shares`);if(sh&&await sh.isVisible())await sh.fill(n===1?'100':'50');};
 for (let i=1;i<=n;i++) await fill(i);
 await c.selectOption('#fw-share-capital select',{index:1});
 // draw signatures
 for (const cv of await c.$$('canvas')) { const bx=await cv.boundingBox(); if(!bx) continue; await cv.scrollIntoViewIfNeeded(); const b2=await cv.boundingBox(); await c.mouse.move(b2.x+20,b2.y+30);await c.mouse.down();await c.mouse.move(b2.x+120,b2.y+50,{steps:6});await c.mouse.move(b2.x+60,b2.y+20,{steps:6});await c.mouse.up(); }
 await c.click('#stage-people .btn-next');
 const perr=await c.$$eval('#stage-people .has-err, #stage-people .err-box',e=>e.filter(x=>x.offsetParent).length).catch(()=>0);
 if (!(await c.isVisible('#stage-docs'))) { console.log('  people errors:', await c.$$eval('#stage-people .has-err',e=>e.filter(x=>x.offsetParent).map(x=>x.id+':'+x.innerText.slice(0,60).replace(/\n/g,' '))), await c.$$eval('#stage-people [id*=err], #stage-people .people-error',e=>e.filter(x=>x.offsetParent).map(x=>x.id+':'+x.innerText.slice(0,90))));0&&console.log(perr, (await c.textContent('#stage-people')).replace(/\s+/g,' ').match(/(required|Required|must|Please)[^.]{0,80}/g)?.slice(0,4)); }
 await c.click('#stage-docs .btn-next');await c.check('#dec1');await c.check('#dec2');
 n0=emails().length;await c.click('#submit-btn');await done(c);
 ok((await c.textContent('#success-screen h2')).includes('Application Details Received')&&(await c.textContent('#s-ref')).trim()===ref,'full details accepted on the same reference');
 const dn=emails().slice(n0).find(e=>/Details completed/.test(e.subject));ok(dn&&dn.subject.includes(ref),'admin alert: '+(dn&&dn.subject));
 await a.goto(B+caseUrl);body=(await a.textContent('body')).replace(/\s+/g,' ');
 ok(!body.includes('Full details not collected yet')&&body.includes('Person 1 Full Name')&&body.includes('Full details completed'),'case now holds the full details; details card gone');
 await a.goto(B+caseUrl+'?tab=documents');ok((await a.textContent('body')).includes('signature-1-'),'signatures attached to the same case');
 await a.goto(B+caseUrl+'?tab=activity');body=await a.textContent('body');ok(body.includes('Client completed the full application')&&body.includes('Full application form sent to the client'),'activity log records both steps');
 await a.goto(B+'/admin/cases');ok(await a.locator('a.row',{hasText:ref}).count()===1,'still one case, not two');
 await b.close();})().catch(e=>{console.log('ERROR',e.message.split('\n').slice(0,4).join(' | '));process.exit(1)});
