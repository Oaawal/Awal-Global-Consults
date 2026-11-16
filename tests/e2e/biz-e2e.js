const { chromium, request: pwreq } = require('playwright');const fs=require('fs');const S=process.argv[2];const B='http://127.0.0.1:8788';
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
(async()=>{const api=await pwreq.newContext();
 // server refuses a registration without the business details
 const base={Full_Name:'Kola Ade',Phone:'08031112299',Email:'kola@gmail.com',Services_Requested:'Business Name Registration',Declaration_Accurate:'Yes',Declaration_Consent:'Yes',People_Count:'1',
  Person_1_Full_Name:'Kola Ade',Person_1_Role:'Sole Proprietor',Person_1_Nationality:'Nigerian',Person_1_NIN:'77777777777',Person_1_Date_of_Birth:'1990-01-01',Person_1_Gender:'Male',Person_1_Phone:'08031112299',Person_1_Email:'kola@gmail.com',Person_1_Occupation:'Trader',Person_1_Residential_Address:'4 Allen Avenue, Ikeja',
  Signatures:{name:'signature-1-kola-ade.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a0000000d49484452','hex')}};
 let r=await api.post(B+'/submit-kyc',{multipart:base});let j=await r.json();ok(r.status()===400&&j.field==='business'&&/first-choice name/.test(j.error),'server refuses a registration without proposed names: '+j.error);
 r=await api.post(B+'/submit-kyc',{multipart:{...base,Proposed_Name_1:'Kola Stores',Proposed_Name_2:'kola stores',Business_Category:'Wholesale and Retail Trade; Repair of Motor Vehicles and Motorcycles',Specific_Nature_Of_Business:'Sale of provisions',Business_Address:'4 Allen Avenue, Ikeja'}});j=await r.json();
 ok(r.status()===400&&/different second-choice/.test(j.error),'same name twice refused');
 r=await api.post(B+'/submit-kyc',{multipart:{...base,Proposed_Name_1:'Kola Stores',Proposed_Name_2:'Kola Provisions',Business_Address:'4 Allen Avenue, Ikeja'}});j=await r.json();
 ok(r.status()===400&&/nature of business category/.test(j.error),'registration without a CAC category refused');
 r=await api.post(B+'/submit-kyc',{multipart:{Intake:'quick',Full_Name:'Kola Ade',Phone:'08031112299',Email:'kola@gmail.com',Services_Requested:'Business Name Registration',Declaration_Accurate:'Yes',Declaration_Consent:'Yes'}});
 ok(r.status()===200,'quick quotation request still needs none of this');
 // UI: limited company
 const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844}});await p.addInitScript(()=>{try{localStorage.setItem('agc_consent','denied')}catch(e){}});
 await p.goto(B+'/kyc/?s=company',{waitUntil:'load'});await p.click('#full-start');
 await p.fill('#fullname','Ifeoma Nwosu');await p.fill('#phone','08031114444');await p.fill('#email','ifeoma@gmail.com');await p.click('#stage-details .btn-next.full-only');
 ok(await p.isVisible('#stage-business'),'business step follows contact details');
 ok(await p.isVisible('#biz-category')&&await p.isVisible('#company-type')&&await p.isVisible('#ltd-objects')&&!(await p.isVisible('#ngo-aims')),'company: category, specific nature, company type and objects (no aims)');
 ok((await p.$$eval('#company-type option',o=>o.map(x=>x.textContent))).join('|')==='Private Company Limited by Shares|Private Unlimited Company|Public Company Limited by Shares|Public Unlimited Company|Company Limited by Guarantee','company types match CAC');
 ok(/Limited/.test(await p.textContent('#name-hint')),'company name hint mentions Limited');
 await p.click('#stage-business .btn-next');ok(await p.isVisible('#stage-business')&&await p.isVisible('#fw-name1.has-err'),'empty step is refused');
 await p.fill('#name1','Nwosu Logistics');await p.fill('#name2','Nwosu Haulage');await p.selectOption('#biz-category',{label:'Transportation'});await p.fill('#biz-nature','Logistics and haulage services');await p.fill('#ltd-objects','Warehousing\nImport and export');await p.fill('#biz-address','12 Creek Road, Apapa, Lagos');
 await (await p.$('#stage-business')).screenshot({path:S+'/biz-ltd.png'});
 await p.click('#stage-business .btn-next');ok(await p.isVisible('#stage-people'),'continues to directors and shareholders');
 ok(await p.inputValue('#name1')==='Nwosu Logistics Ltd'&&await p.inputValue('#name2')==='Nwosu Haulage Ltd','company names get Ltd added');
 // UI: business name
 await p.goto(B+'/kyc/?s=business-name',{waitUntil:'load'});await p.click('#full-start');
 await p.fill('#fullname','Kola Ade');await p.fill('#phone','08031112299');await p.fill('#email','kola@gmail.com');await p.click('#stage-details .btn-next.full-only');
 ok(await p.isVisible('#biz-category')&&await p.isVisible('#biz-nature')&&!(await p.isVisible('#company-type'))&&!(await p.isVisible('#ltd-objects')),'business name: one category and one specific nature only');
 ok(await p.$eval('#biz-category',el=>!el.multiple&&el.options.length===46),'single choice from the 45 CAC categories');
 ok((await p.textContent('#nature-hint')).includes('one category and one main activity'),'business name hint explains the one-category rule');
 await (await p.$('#stage-business')).screenshot({path:S+'/biz-bn.png'});
 // UI: NGO
 await p.goto(B+'/kyc/?s=ngo',{waitUntil:'load'});await p.click('#full-start');
 await p.fill('#fullname','Grace Obi');await p.fill('#phone','08031115555');await p.fill('#email','grace@gmail.com');await p.click('#stage-details .btn-next.full-only');
 ok(await p.isVisible('#ngo-aims')&&await p.isVisible('#biz-category')&&!(await p.isVisible('#company-type')),'NGO: category plus aims and objectives');
 // full submission via API with details, then dashboard shows them and nothing missing for them
 r=await api.post(B+'/submit-kyc',{multipart:{...base,Proposed_Name_1:'Kola Stores',Proposed_Name_2:'Kola Provisions',Business_Category:'Wholesale and Retail Trade; Repair of Motor Vehicles and Motorcycles',Specific_Nature_Of_Business:'Sale of provisions and household goods',Business_Address:'4 Allen Avenue, Ikeja, Lagos'}});j=await r.json();
 ok(r.status()===200,'complete business name application accepted');
 const a=await b.newPage({viewport:{width:1280,height:900}});await a.addInitScript(()=>{try{localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 await a.goto(B+'/admin/login');await a.fill('#email','info@awalglobal.com.ng');await a.click('button[type=submit]');
 const code=emails().filter(e=>/login code/.test(e.subject)).at(-1).subject.match(/(\d{6})/)[1];await a.fill('#code',code);await a.click('button[type=submit]');await a.waitForURL(B+'/admin/');
 const caseUrl=emails().filter(e=>e.subject.includes(j.reference)).map(e=>(e.html||'').match(/\/admin\/case\/[0-9a-f-]{36}/)).filter(Boolean)[0][0];
 await a.goto(B+caseUrl);let t=(await a.textContent('body')).replace(/\s+/g,' ');
 ok(t.includes('Proposed Name 1')&&t.includes('Kola Stores')&&t.includes('Business Category')&&t.includes('Sale of provisions'),'case shows names, category and specific nature');
 ok(!/Two proposed names|Nature of business|Business address in Nigeria/.test(await a.textContent('#missing').catch(()=>'')),'nothing missing for these');
 await a.goto(B+caseUrl+'?tab=billing');ok(await a.inputValue('input[name=address]')==='4 Allen Avenue, Ikeja, Lagos','quotation picks up the business address');
 await b.close();})().catch(e=>{console.log('ERR',e.message.split('\n')[0]);process.exit(1)});
