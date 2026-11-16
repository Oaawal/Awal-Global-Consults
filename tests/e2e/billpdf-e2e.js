const { chromium, request: pwreq } = require('playwright');const fs=require('fs');const S=process.argv[2];const B='http://127.0.0.1:8788';
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const isPdf=a=>Buffer.from(a.content,'base64').subarray(0,5).toString()==='%PDF-';
(async()=>{const api=await pwreq.newContext();
 let r=await api.post(B+'/submit-kyc',{multipart:{Full_Name:'Ṣadé Ọlá',Phone:'08031234567',Email:'sade@gmail.com',Business_Name:'Ọlá Ventures',Services_Requested:'SCUML Registration',Declaration_Accurate:'Yes',Declaration_Consent:'Yes',People_Count:'1',Person_1_Full_Name:'Ṣadé Ọlá',Person_1_Role:'Proprietor',Person_1_Nationality:'Nigerian',Person_1_NIN:'55555555555',Person_1_Date_of_Birth:'1985-01-01',Person_1_Gender:'Female',Person_1_Phone:'08031234567',Person_1_Email:'sade@gmail.com',Person_1_Occupation:'Trader',Person_1_Residential_Address:'3 Allen Avenue, Ikeja'}});
 const caseId=(await r.json()).uploadLink.split('/upload/')[1].split('/')[0];
 const b=await chromium.launch();const a=await b.newPage({viewport:{width:1280,height:900},acceptDownloads:true});await a.addInitScript(()=>{try{localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 a.on('dialog',d=>d.accept());
 await a.goto(B+'/admin/login');await a.fill('#email','info@awalglobal.com.ng');await a.click('button[type=submit]');
 const code=emails().filter(e=>/login code/.test(e.subject)).at(-1).subject.match(/(\d{6})/)[1];await a.fill('#code',code);await a.click('button[type=submit]');await a.waitForURL(B+'/admin/');
 await a.goto(B+`/admin/case/${caseId}?tab=billing`);
 let n0=emails().length;await a.click('button[name=send][value="1"]');await a.waitForLoadState();
 const qm=emails().slice(n0).find(e=>/quotation AGC-QT-/.test(e.subject));
 ok(qm&&qm.attachment.length===1&&/^Quotation-AGC-QT-\d{4}-\w{3}-\d+\.pdf$/.test(qm.attachment[0].name)&&isPdf(qm.attachment[0]),'quotation email carries '+(qm&&qm.attachment.map(x=>x.name)));
 ok(qm.html.includes('A PDF copy is attached'),'email says a PDF is attached');
 fs.writeFileSync(S+'/att-quote.pdf',Buffer.from(qm.attachment[0].content,'base64'));
 // admin PDF button
 const [dl]=await Promise.all([a.waitForEvent('download'),a.click('a.btn:has-text("PDF")')]);ok(/\.pdf$/.test(dl.suggestedFilename()),'dashboard PDF button downloads '+dl.suggestedFilename());
 // client link + pdf
 const link=qm.html.match(/http[^"]*\/billing\/[0-9a-f-]{36}\/[\w-]+/)[0].replace('https://awalglobal.com.ng',B);
 const cp=await b.newPage();await cp.goto(link);ok(await cp.locator('a.pdf').getAttribute('href')===new URL(link).pathname+'/pdf','client page has a Download PDF button');
 let pr=await api.get(link+'/pdf');ok(pr.status()===200&&pr.headers()['content-type']==='application/pdf'&&/attachment; filename="Quotation-/.test(pr.headers()['content-disposition']),'client PDF link downloads a PDF');
 pr=await api.get(link.slice(0,-2)+'xx/pdf');ok(pr.status()===404,'tampered PDF link refused');
 pr=await api.get(link+'/other');ok(pr.status()===404,'unknown suffix refused');
 // invoice then payment with letter
 await a.goto(B+`/admin/case/${caseId}?tab=billing`);await a.click('text=Make invoice');await a.waitForLoadState();
 n0=emails().length;await a.click('button[name=send][value="1"]');await a.waitForLoadState();
 const im=emails().slice(n0).find(e=>/invoice AGC-INV-/.test(e.subject));ok(im&&im.attachment.length===1&&/^Invoice-AGC-INV-/.test(im.attachment[0].name)&&isPdf(im.attachment[0]),'invoice email carries '+(im&&im.attachment.map(x=>x.name)));
 fs.writeFileSync(S+'/att-invoice.pdf',Buffer.from(im.attachment[0].content,'base64'));
 await a.click('text=Record payment and issue receipt');await a.fill('form[action$="/payment"] input[name=ref]','PSK-998877');
 n0=emails().length;await a.click('form[action$="/payment"] button[type=submit]');await a.waitForLoadState();
 const rm=emails().slice(n0).find(e=>/receipt AGC-RCT-/.test(e.subject));
 ok(rm&&rm.attachment.length===2&&/^Receipt-AGC-RCT-/.test(rm.attachment[0].name)&&/^Engagement-letter-AGC-EL-/.test(rm.attachment[1].name)&&rm.attachment.every(isPdf),'receipt email carries '+(rm&&rm.attachment.map(x=>x.name)));
 ok(/engagement letter AGC-EL-/.test(rm.html),'receipt email still links the engagement letter');
 rm.attachment.forEach((x,i)=>fs.writeFileSync(S+`/att-${i?'letter':'receipt'}.pdf`,Buffer.from(x.content,'base64')));
 ok((await a.textContent('body')).includes('Payment recorded'),'payment recorded');
 await b.close();})().catch(e=>{console.log('ERROR',e.message);process.exit(1)});
