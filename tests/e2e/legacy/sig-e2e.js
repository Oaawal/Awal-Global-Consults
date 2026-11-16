const { chromium } = require('playwright');const fs=require('fs');const S=process.argv[2];const B='http://127.0.0.1:8788';
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const waitDone=p=>p.waitForFunction(()=>getComputedStyle(document.getElementById('success-screen')).display!=='none'||getComputedStyle(document.getElementById('submit-error')).display!=='none',null,{timeout:40000});
(async()=>{const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await p.addInitScript(()=>{try{localStorage.setItem('agc_consent','denied');localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 await p.goto(B+'/kyc/',{waitUntil:'load'});await p.check('input[name=svc][value="Limited Company Registration"]');await p.click('#stage-services .btn-next');
 await p.fill('#fullname','Kola Ade');await p.fill('#phone','08031112222');await p.fill('#email','kola@gmail.com');await p.click('#stage-details .btn-next');
 await p.selectOption('#people-count','2');
 ok(!(await p.$('#p1-siglater')),'no "provide later" tick');
 const per=async(i,d)=>{await p.fill(`#p${i}-name`,d.n);await p.selectOption(`#p${i}-role`,'Director & Shareholder');await p.fill(`#p${i}-nin`,d.nin);await p.fill(`#p${i}-dob`,'1985-01-01');await p.selectOption(`#p${i}-gender`,'Male');await p.fill(`#p${i}-phone`,'08031112222');await p.fill(`#p${i}-email`,d.e);await p.fill(`#p${i}-occupation`,'Trader');await p.fill(`#p${i}-address`,'9 Awolowo Road, Ikoyi');await p.fill(`#p${i}-shares`,'50');};
 await per(1,{n:'Bisi Ade',nin:'11111111111',e:'bisi@gmail.com'});await per(2,{n:'Kola Ade',nin:'22222222222',e:'kola@gmail.com'});await p.selectOption('#share-capital','1,000,000');
 await p.click('#stage-people .btn-next');ok(await p.$eval('#pw-1-sig',e=>e.classList.contains('has-err'))&&await p.$eval('#pw-2-sig',e=>e.classList.contains('has-err')),'blocked until both have signatures');
 // person 1 draws
 const c=await p.$('#p1-sig');await c.scrollIntoViewIfNeeded();const bb=await c.boundingBox();
 await p.mouse.move(bb.x+30,bb.y+100);await p.mouse.down();await p.mouse.move(bb.x+120,bb.y+50,{steps:12});await p.mouse.move(bb.x+220,bb.y+110,{steps:12});await p.mouse.move(bb.x+300,bb.y+60,{steps:12});await p.mouse.up();
 // person 2 uploads a photo
 await p.setInputFiles('#pw-2-sig input[type=file]',S+'/sig-photo.png');
 ok(await p.isVisible('#p2-sigimg'),'uploaded signature previews in the box');
 await p.click('#stage-people .btn-next');ok(await p.isVisible('#stage-docs'),'drawn + uploaded signatures accepted');
 await p.click('#stage-docs .btn-next');await p.check('#dec1');await p.check('#dec2');await p.click('#submit-btn');await waitDone(p);
 const ref=(await p.textContent('#s-ref')).trim();ok(await p.isVisible('#success-screen'),'submitted '+ref);
 // dashboard: open the signatures as images
 const a=await b.newPage({viewport:{width:1280,height:900}});await a.addInitScript(()=>{try{localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 await a.goto(B+'/admin/login');await a.fill('#email','info@awalglobal.com.ng');await a.click('button[type=submit]');
 const code=emails().filter(e=>e.subject.includes('login code')).at(-1).subject.match(/(\d{6})/)[1];await a.fill('#code',code);await a.click('button[type=submit]');await a.waitForURL(B+'/admin/');
 await a.fill('input[name=q]',ref).catch(()=>{});await a.goto(B+'/admin/cases?q='+ref);
 const href=await a.getAttribute(`a[href^="/admin/case/"]:has-text("${ref}")`,'href');await a.goto(B+href+'?tab=documents');
 const docs=await a.$$eval('a[href^="/admin/doc/"]',els=>els.map(e=>({h:e.getAttribute('href'),t:e.textContent.trim()})));
 const sigs=docs.filter(d=>/signature-/.test(d.t));console.log('  documents:',docs.map(d=>d.t).join(' | '));
 ok(sigs.length===2,'two signatures on the case');
 for (const d of sigs){const r=await a.request.get(B+d.h);const buf=await r.body();fs.writeFileSync(S+'/'+d.t.replace(/[^\w.-]/g,'_'),buf);
  ok(/image\/(png|jpeg)/.test(r.headers()['content-type'])&&buf.length>500,`${d.t} opens as ${r.headers()['content-type']} (${buf.length} bytes)`);}
 await b.close();})();
