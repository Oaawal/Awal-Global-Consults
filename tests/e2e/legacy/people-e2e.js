const { chromium, request: pwreq } = require('playwright');const fs=require('fs');const S=process.argv[2];const B='http://127.0.0.1:8788';
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
async function start(p, services){await p.goto(B+'/kyc/',{waitUntil:'load'});await p.addStyleTag({content:'.credentials-bar{display:none}'});
 for(const s of services) await p.check(`input[name=svc][value="${s}"]`);await p.click('#stage-services .btn-next');
 await p.fill('#fullname','Ada Obi');await p.fill('#phone','08031234567');}
async function sign(p,i){const c=await p.$(`#p${i}-sig`);await c.scrollIntoViewIfNeeded();const b=await c.boundingBox();await p.mouse.move(b.x+30,b.y+90);await p.mouse.down();await p.mouse.move(b.x+120,b.y+60,{steps:8});await p.mouse.move(b.x+200,b.y+100,{steps:8});await p.mouse.up();}
async function person(p,i,d){await p.fill(`#p${i}-name`,d.name);await p.selectOption(`#p${i}-role`,d.role);await p.fill(`#p${i}-nin`,d.nin);await p.fill(`#p${i}-dob`,'1990-05-01');await p.selectOption(`#p${i}-gender`,'Female');
 await p.fill(`#p${i}-phone`,'08031234567');await p.fill(`#p${i}-email`,d.email);await p.fill(`#p${i}-occupation`,'Trader');await p.fill(`#p${i}-address`,'12 Allen Avenue, Ikeja, Lagos');if(d.shares!==undefined)await p.fill(`#p${i}-shares`,String(d.shares));}
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844}});await p.addInitScript(()=>{try{localStorage.setItem('agc_consent','denied')}catch(e){}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 // A: email typo on details
 await start(p,['Limited Company Registration']);await p.fill('#email','ada@gmial.com');await p.click('#fullname');await p.waitForTimeout(600);
 ok((await p.textContent('#email-note')).includes('gmail.com'),'typo suggestion shown: '+(await p.textContent('#email-note')).trim());
 await p.click('#email-note button');await p.waitForTimeout(500);ok(await p.inputValue('#email')==='ada@gmail.com','suggestion applied');
 await p.click('#stage-details .btn-next');ok(await p.isVisible('#stage-people'),'company → People step appears');
 ok((await p.textContent('#stage-people .step-counter')).trim()==='Step 3 of 5','step counter shows 3 of 5');
 await p.selectOption('#people-count','2');
 await p.click('#stage-people .btn-next');ok(await p.isVisible('#people-error'),'empty people step blocked');
 await p.click('#stage-people .copy-me');ok(await p.inputValue('#p1-name')==='Ada Obi','copy my details works');
 await person(p,1,{name:'Ada Obi',role:'Director & Shareholder',nin:'12345678901',email:'ada@gmail.com',shares:60});
 await person(p,2,{name:'Ben Okafor',role:'Shareholder',nin:'1234567',email:'ben@mailinator.com',shares:30});
 await p.click('#p1-name');await p.waitForTimeout(600);
 await p.selectOption('#share-capital','1,000,000');
 await p.click('#stage-people .btn-next');
 const errTxt=await p.textContent('#people-error');ok(/100%/.test(errTxt),'shares not adding to 100 caught');
 ok(await p.$eval('#pw-2-nin',e=>e.classList.contains('has-err')),'short NIN flagged');
 ok(await p.$eval('#pw-2-email',e=>e.classList.contains('has-err')),'disposable email flagged');
 ok(await p.$eval('#pw-1-sig',e=>e.classList.contains('has-err')),'missing signature flagged');
 await p.fill('#p2-nin','10987654321');await p.fill('#p2-email','ben@yahoo.com');await p.click('#p2-name');await p.waitForTimeout(500);await p.fill('#p2-shares','40');
 await sign(p,1);await sign(p,2);
 await p.click('#stage-people .btn-next');ok(await p.isVisible('#stage-docs'),'complete people step accepted → Documents');
 await p.click('#stage-docs .btn-next');ok((await p.textContent('#summary-lines')).includes('Ben Okafor: Shareholder (40%), signed'),'review lists people');
 await p.check('#dec1');await p.check('#dec2');const n0=emails().length;await p.click('#submit-btn');
 await p.waitForFunction(()=>getComputedStyle(document.getElementById('success-screen')).display!=='none'||getComputedStyle(document.getElementById('submit-error')).display!=='none',null,{timeout:40000});
 ok(await p.isVisible('#success-screen'),'company application submitted: '+(await p.isVisible('#success-screen')?await p.textContent('#s-ref'):await p.textContent('#submit-error')));
 const adm=emails().slice(n0).find(e=>/Client Intake/.test(e.subject));
 ok(adm&&adm.html.includes('*******8901')&&!adm.html.includes('12345678901'),'admin email masks NIN');
 // B: SCUML only - no signature needed
 await start(p,['SCUML Registration']);await p.fill('#email','ada@gmail.com');await p.click('#stage-details .btn-next');
 ok(await p.isVisible('#stage-people')&&!(await p.$('#p1-sig')),'SCUML → people step without signatures');
 // C: TIN only - no people step
 await start(p,['TIN Registration & Validation']);await p.fill('#email','ada@gmail.com');await p.click('#stage-details .btn-next');
 ok(await p.isVisible('#stage-docs')&&(await p.textContent('#stage-docs .step-counter')).trim()==='Step 3 of 4','TIN → straight to Documents, 4 steps');
 ok(!errs.length,'no page errors '+errs.join(';'));
 // D: server rejects registration without signatures
 const api=await pwreq.newContext();const base={Full_Name:'X Y',Phone:'08031234567',Email:'xy@gmail.com',Services_Requested:'Business Name Registration',Declaration_Accurate:'Yes',Declaration_Consent:'Yes',People_Count:'1',
  Person_1_Full_Name:'X Y',Person_1_Role:'Sole Proprietor',Person_1_Nationality:'Nigerian',Person_1_NIN:'12345678901',Person_1_Date_of_Birth:'1990-01-01',Person_1_Gender:'Male',Person_1_Phone:'08031234567',Person_1_Email:'xy@gmail.com',Person_1_Occupation:'Trader',Person_1_Residential_Address:'1 Long Street Lagos'};
 let r=await api.post(B+'/submit-kyc',{multipart:base});ok(r.status()===400&&/signature/i.test((await r.json()).error),'server: signature required');
 r=await api.post(B+'/submit-kyc',{multipart:{...base,Person_1_NIN:'123'}});ok(r.status()===400&&/11 digits/.test((await r.json()).error),'server: NIN must be 11 digits');
 r=await api.post(B+'/submit-kyc',{multipart:{...base,Email:'xy@gmial.com'}});ok(r.status()===400&&/gmail.com/.test((await r.json()).error),'server: email typo rejected');
 await p.screenshot({path:S+'/x.png'});
 await b.close();})();
