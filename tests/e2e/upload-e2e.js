const { chromium, request: pwreq } = require('playwright');const fs=require('fs');const S=process.argv[2];const B='http://127.0.0.1:8788';
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
(async()=>{const api=await pwreq.newContext();
 // 1. application returns an upload link and emails it
 let r=await api.post(B+'/submit-kyc',{multipart:{Full_Name:'Tola Ojo',Phone:'08031234567',Email:'tola@gmail.com',Services_Requested:'TIN Registration & Validation',Declaration_Accurate:'Yes',Declaration_Consent:'Yes'}});
 const j=await r.json();ok(/\/upload\/[0-9a-f-]{36}\/[\w-]{32}$/.test(j.uploadLink||''),'submission returns a private upload link');
 const link=j.uploadLink.replace('https://awalglobal.com.ng',B);
 const cm=emails().find(e=>e.to[0].email==='tola@gmail.com');ok(cm&&cm.html.includes('/upload/')&&cm.html.includes('Upload documents'),'confirmation email has the Upload documents button');
 ok(cm&&!/resend .* on WhatsApp|send them on WhatsApp/i.test(cm.html),'confirmation email no longer asks for documents on WhatsApp');
 // 2. the link works; a tampered link does not
 const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844}});
 let res=await p.goto(link);ok(res.status()===200&&(await p.textContent('h1')).includes('Upload your documents'),'upload page opens');
 res=await p.goto(link.slice(0,-3)+'abc');ok(res.status()===404,'tampered link refused (404)');
 await p.goto(link);await p.fill('#what','NIN slip');
 await p.setInputFiles('input[type=file]',{name:'nin.pdf',mimeType:'application/pdf',buffer:Buffer.concat([Buffer.from('%PDF-1.4\n'),Buffer.alloc(3000,65)])});
 const n0=emails().length;await p.click('button[type=submit]');await p.waitForLoadState();
 ok((await p.textContent('body')).includes('We received 1 document'),'upload accepted');
 const am=emails().slice(n0).find(e=>/Client uploaded/.test(e.subject));ok(!!am,'you get an alert: '+(am&&am.subject));
 await p.screenshot({path:S+'/upload-page.png',fullPage:true});
 // 3. dashboard shows the file and the link
 const a=await b.newPage({viewport:{width:1280,height:900}});await a.addInitScript(()=>{try{localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 await a.goto(B+'/admin/login');await a.fill('#email','info@awalglobal.com.ng');await a.click('button[type=submit]');
 const code=emails().filter(e=>e.subject.includes('login code')).at(-1).subject.match(/(\d{6})/)[1];await a.fill('#code',code);await a.click('button[type=submit]');await a.waitForURL(B+'/admin/');
 const caseId=link.split('/upload/')[1].split('/')[0];
 await a.goto(B+'/admin/case/'+caseId);ok((await a.inputValue('input[aria-label="Upload link"]')).includes('/upload/'+caseId),'case page shows the client upload link');
 await a.goto(B+'/admin/case/'+caseId+'?tab=documents');ok((await a.textContent('body')).includes('nin-slip--nin.pdf'),'uploaded file is on the case, labelled');
 await a.goto(B+'/admin/case/'+caseId+'?tab=activity');ok((await a.textContent('body')).includes('Client uploaded documents'),'activity shows the upload');
 // 4. closed case: link stops working
 await a.goto(B+'/admin/case/'+caseId);
 await a.evaluate(async(id)=>{const f=new FormData();f.append('status','closed');await fetch('/admin/case/'+id+'/status',{method:'POST',body:f});},caseId);
 res=await p.goto(link);ok(res.status()===410,'link refuses uploads once the case is closed (410)');
 await b.close();})();
