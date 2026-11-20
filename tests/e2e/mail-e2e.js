// Dashboard mailbox: real emails through the awal-mail Worker (ops/mail-worker.js) into the dashboard,
// security warnings, safe display, attachments, replies that thread, sending limits on file types.
const { chromium } = require('playwright');const fs=require('fs');const {spawn,execSync}=require('child_process');const S=process.argv[2];const B='http://127.0.0.1:8788';const W='http://127.0.0.1:8799';
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const txt=async p=>(await p.textContent('body')).replace(/\s+/g,' ');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pdf=Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
const b64=b=>b.toString('base64').replace(/.{76}/g,'$&\r\n');
function eml({from,subject,msgid,inReplyTo,auth,html,text,atts=[],replyTo}){
  const bd='b'+Math.random().toString(36).slice(2);
  return [auth?`Authentication-Results: ${auth}`:null,`From: ${from}`,'To: info@awalglobal.com.ng',replyTo?`Reply-To: ${replyTo}`:null,`Subject: ${subject}`,`Message-ID: ${msgid}`,inReplyTo?`In-Reply-To: ${inReplyTo}`:null,inReplyTo?`References: ${inReplyTo}`:null,
   'Date: Fri, 20 Nov 2026 09:00:00 +0100','MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${bd}"`,'',
   `--${bd}`,'Content-Type: multipart/alternative; boundary="alt'+bd+'"','',
   '--alt'+bd,'Content-Type: text/plain; charset=utf-8','',text||'Plain text','--alt'+bd,'Content-Type: text/html; charset=utf-8','',html||'<p>Hi</p>','--alt'+bd+'--',
   ...atts.flatMap(a=>[`--${bd}`,`Content-Type: ${a.type}; name="${a.name}"`,`Content-Disposition: ${a.inline?'inline':'attachment'}; filename="${a.name}"`,a.cid?`Content-ID: <${a.cid}>`:null,'Content-Transfer-Encoding: base64','',b64(a.data)].filter(x=>x!==null)),
   `--${bd}--`,''].filter(x=>x!==null).join('\r\n');
}
const deliver=async(from,raw)=>{const r=await fetch(`${W}/cdn-cgi/handler/email?from=${encodeURIComponent(from)}&to=info@awalglobal.com.ng`,{method:'POST',body:raw});return r.status};
(async()=>{
 // The mail Worker, sharing the local database and storage with the site
 fs.writeFileSync(S+'/mailw.toml',`name="awal-mail"\nmain="${process.cwd()}/ops/mail-worker.js"\ncompatibility_date="2025-09-01"\n[[d1_databases]]\nbinding="DB"\ndatabase_name="local-test"\ndatabase_id="local-test"\n[[r2_buckets]]\nbinding="DOCS"\nbucket_name="awal-documents"\n[vars]\nSITE_URL="${B}"\nCRON_SECRET="x"\n`);
 const w=spawn(process.cwd()+'/tests/node_modules/.bin/wrangler',['dev','-c',S+'/mailw.toml','--port','8799','--ip','127.0.0.1','--persist-to',S+'/wrstate'],{stdio:['ignore',fs.openSync(S+'/mailw.log','w'),fs.openSync(S+'/mailw.log','a')]});
 for(let i=0;i<60;i++){try{if((await fetch(W)).ok)break}catch(e){}await sleep(1000)}
 const b=await chromium.launch();const a=await b.newPage({viewport:{width:390,height:844}});await a.addInitScript(()=>{try{localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 try{
 // Not signed in: nothing is reachable
 ok((await fetch(B+'/cron/mail-in',{method:'POST',body:'{}'})).status===401,'mail-in endpoint refuses calls without the secret');
 // A client we already know
 const stamp=Date.now()%100000;const cEmail=`ngozi${stamp}@example.com`;
 await a.goto(B+'/admin/login');await a.fill('#email','info@awalglobal.com.ng');await a.click('button[type=submit]');
 const code=emails().filter(e=>/login code/.test(e.subject)).at(-1).subject.match(/(\d{6})/)[1];await a.fill('#code',code);await a.click('button[type=submit]');await a.waitForURL(B+'/admin/');
 await a.goto(B+'/admin/import');await a.fill('#i-name','Ngozi Okafor');await a.fill('#i-phone','0817'+String(stamp).padStart(7,'0'));await a.fill('#i-email',cEmail);
 await a.fill('#i-service','Business Name Registration');await a.fill('#i-date','2026-03-03');await a.click('form[action="/admin/import/one"] button[type=submit]');await a.waitForLoadState();
 const caseUrl=a.url().split('?')[0];
 // 1. A genuine client email with a PDF and an inline picture
 const m1=`<m1.${stamp}@example.com>`;
 ok(await deliver(cEmail,eml({from:`Ngozi Okafor <${cEmail}>`,subject:'My CAC documents',msgid:m1,auth:'mx.cloudflare.net; spf=pass smtp.mailfrom=example.com; dkim=pass; dmarc=pass',
   html:'<p>Good morning, please find my ID attached.</p><img src="cid:logo1"><img src="https://tracker.example/pixel.gif">',text:'Good morning, please find my ID attached.',
   atts:[{name:'my-id.pdf',type:'application/pdf',data:pdf},{name:'logo.png',type:'image/png',data:png,inline:true,cid:'logo1'}]}))<300,'Worker accepts the client email');
 // 2. A phishing email pretending to be us, with a fake verification header of its own
 ok(await deliver('billing@awa1global.com.ng',eml({from:'"Awal Global Accounts" <billing@awa1global.com.ng>',subject:'Urgent: change of bank details',msgid:`<p1.${stamp}@awa1global.com.ng>`,
   auth:'attacker.example; spf=pass; dkim=pass; dmarc=pass',replyTo:'payme@gmail.com',
   html:'<p onclick="steal()">Please note our change of bank details. <a href="https://evil.example/login">www.kudabank.com</a></p><script>alert(1)</script><form action="https://evil.example"><input name="pw"></form>',
   atts:[{name:'invoice.pdf.exe',type:'application/octet-stream',data:Buffer.from('MZ fake program')}]}))<300,'Worker accepts the phishing email (it never drops mail)');
 await sleep(2500);
 // Inbox
 await a.goto(B+'/admin/mail');let body=await txt(a);
 ok(body.includes('My CAC documents')&&body.includes('Urgent: change of bank details'),'both emails are in the inbox');
 ok(/2 unread/.test(body),'unread count shows');
 ok(await a.locator('.bottom-nav a[href="/admin/mail"] .count').textContent()==='2','Mail badge on the navigation');
 ok(/Warning/.test(await a.locator('.mail-row:has-text("change of bank details")').textContent()),'phishing email is flagged in the list');
 ok(/Client/.test(await a.locator('.mail-row:has-text("My CAC documents")').textContent()),'client email is matched to the client');
 // The phishing email
 await a.click('.mail-row:has-text("change of bank details")');await a.waitForLoadState();body=await txt(a);
 ok(body.includes('looks like ours but is not'),'warns about the lookalike domain');
 ok(body.includes('sender\'s name says "Awal Global Accounts"'),'warns about the fake Awal name');
 ok(body.includes('Replies will go to payme@gmail.com'),'warns about the different Reply-To');
 ok(body.includes('show one website but open another'),'warns about the deceptive link');
 ok(body.includes('changed bank or payment details'),'warns about the bank-details change');
 ok(body.includes('can run programs')&&await a.locator('a[data-confirm]:has-text("Download anyway")').count()===1,'program attachment is flagged and needs a confirmation');
 ok(!/Sender verified/.test(body),'a sender-written verification header is not trusted');
 const pid=a.url().split('/').pop().split('?')[0];
 const csp=(await a.evaluate(async u=>{const r=await fetch(u);return [r.headers.get('content-security-policy'),await r.text()]},`/admin/mail/${pid}/body`));
 ok(/sandbox/.test(csp[0])&&!/script-src/.test(csp[0])&&/default-src 'none'/.test(csp[0]),'email content is served sandboxed with no scripts allowed');
 ok(!/<script|onclick|<form|<input/i.test(csp[1]),'scripts, event handlers and forms are removed from the email');
 ok((await a.getAttribute('iframe.mail-frame','sandbox'))==='allow-popups allow-popups-to-escape-sandbox','the frame itself is sandboxed');
 // Unsigned visitors cannot read it
 const anon=await fetch(B+`/admin/mail/${pid}/body`,{redirect:'manual'});ok(anon.status===303||anon.status===302||anon.status===401,'signed-out visitors cannot read emails');
 // Spam
 await a.click('button[value=spam]');await a.waitForLoadState();
 await a.goto(B+'/admin/mail?f=spam');ok((await txt(a)).includes('change of bank details'),'moved to Spam');
 // The client email
 await a.goto(B+'/admin/mail');await a.click('.mail-row:has-text("My CAC documents")');await a.waitForLoadState();body=await txt(a);
 ok(body.includes('Sender verified (example.com)'),'genuine sender shows as verified');
 ok(body.includes('Ngozi Okafor (client)'),'links to the client');
 ok(body.includes('my-id.pdf')&&!body.includes('logo.png'),'attachment listed, inline picture not');
 ok(body.includes('Pictures from the internet are hidden'),'remote pictures blocked by default');
 const mid=a.url().split('/').pop().split('?')[0];
 const frame=await a.evaluate(async u=>(await fetch(u)).text(),`/admin/mail/${mid}/body`);
 ok(frame.includes('data:image/png;base64')&&frame.includes('data-blocked'),'inline picture shown, tracking pixel blocked');
 const withImg=await a.evaluate(async u=>(await fetch(u)).headers.get('content-security-policy'),`/admin/mail/${mid}/body?images=1`);ok(/img-src data: https:/.test(withImg),'pictures load only when asked');
 const dl=await a.evaluate(async u=>{const r=await fetch(u);return [r.headers.get('content-type'),r.headers.get('content-disposition'),(await r.text()).slice(0,8)]},`/admin/mail/${mid}/att/0`);
 ok(dl[0]==='application/octet-stream'&&/^attachment/.test(dl[1])&&dl[2]==='%PDF-1.4','attachment downloads as a file');
 await a.locator('summary:has-text("Save to a case")').click();await a.click('form[action$="/to-case"] button');await a.waitForLoadState();
 ok((await txt(a)).includes('Attachment saved to the case documents'),'PDF saved to the case');
 await a.goto(caseUrl+'?tab=documents');ok((await txt(a)).includes('from-email--my-id.pdf'),'it appears in the case documents');
 // Reply
 await a.goto(B+`/admin/mail/${mid}`);await a.click('a.btn:has-text("Reply")');await a.waitForLoadState();
 ok(await a.inputValue('#m-to')===cEmail&&await a.inputValue('#m-subject')==='Re: My CAC documents','reply is addressed and titled');
 ok((await a.inputValue('#m-body')).includes('> Good morning, please find my ID attached.'),'reply quotes the original');
 await a.fill('#m-body','Thank you Ngozi, received. We will file today.\n\n'+(await a.inputValue('#m-body')));
 await a.setInputFiles('#m-files',[{name:'checklist.pdf',mimeType:'application/pdf',buffer:pdf}]);
 await a.click('.mail-compose button[type=submit]');await a.waitForLoadState();body=await txt(a);
 const sent=emails().filter(e=>e.subject==='Re: My CAC documents').at(-1);
 ok(body.includes('Email sent.'),'reply sent');
 ok(sent&&sent.sender.email==='info@awalglobal.com.ng'&&sent.to[0].email===cEmail,'sent from info@ to the client');
 ok(sent&&sent.headers&&sent.headers['In-Reply-To']===m1&&sent.headers.References.includes(m1),'threading headers set');
 ok(sent&&sent.attachment.length===1&&sent.attachment[0].name==='checklist.pdf','attachment sent');
 ok(sent&&!/<script/i.test(sent.html)&&sent.html.includes('Thank you Ngozi'),'message body sent as clean HTML');
 ok(await a.locator('.mail-msg').count()===2&&/Awal Global Consults <info@awalglobal\.com\.ng>/.test(body),'reply shows in the conversation');
 // The client answers our reply: it joins the same conversation
 await deliver(cEmail,eml({from:`Ngozi Okafor <${cEmail}>`,subject:'Re: Re: My CAC documents',msgid:`<m3.${stamp}@example.com>`,inReplyTo:sent.messageId,auth:'mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass',html:'<p>Thanks!</p>',text:'Thanks!'}));
 await sleep(2000);await a.goto(B+'/admin/mail');
 ok(await a.locator('.mail-row:has-text("Ngozi")').count()===1&&/\(3\)/.test(await a.locator('.mail-row:has-text("Ngozi")').textContent()),'client reply threads into one conversation of 3');
 await a.click('.mail-row:has-text("Ngozi")');await a.waitForLoadState();
 ok((await a.frameLocator('iframe.mail-frame').last().locator('body').textContent({timeout:10000})).includes('Thanks!'),'email text shows inside the safe frame');
 // Unsafe attachment cannot be sent
 await a.goto(B+'/admin/mail/new?to='+encodeURIComponent(cEmail));await a.fill('#m-subject','Test');await a.fill('#m-body','Hello');
 await a.setInputFiles('#m-files',[{name:'tool.exe',mimeType:'application/octet-stream',buffer:Buffer.from('MZ')}]);await a.click('.mail-compose button[type=submit]');await a.waitForLoadState();
 ok((await txt(a)).includes('can carry malware'),'program files cannot be sent');
 await a.setInputFiles('#m-files',[]);await a.fill('#m-to','not-an-email');await a.fill('#m-subject','Test');await a.fill('#m-body','Hello');await a.click('.mail-compose button[type=submit]');await a.waitForLoadState();
 ok((await txt(a)).includes("don't look right"),'bad addresses refused');
 // Trash and restore
 await a.goto(B+`/admin/mail/${mid}`);await a.click('button[value=trash]');await a.waitForLoadState();
 await a.goto(B+'/admin/mail?f=trash');ok((await txt(a)).includes('My CAC documents'),'deleted conversation is in Trash');
 await a.click('.mail-row:has-text("Ngozi")');await a.click('button[value=restore]');await a.waitForLoadState();
 await a.goto(B+'/admin/mail');ok((await txt(a)).includes('My CAC documents'),'restored to the inbox');
 // Activity log
 await a.goto(B+'/admin/activity?filter=mail');body=await txt(a);ok(body.includes('Email sent from the mailbox')&&body.includes('Email attachment downloaded'),'sending and downloads are in the activity log');
 // Client export includes the emails
 await a.goto(B+'/admin/mail');await a.click('.mail-row:has-text("Ngozi")');await a.waitForLoadState();
 const clientHref=await a.getAttribute('a[href^="/admin/client/"]','href');
 const ex=await a.evaluate(async u=>(await fetch(u)).json(),clientHref+'/export');ok(Array.isArray(ex.emails)&&ex.emails.length>=3,'client data export includes their emails');
 await a.screenshot({path:S+'/mail-thread.png',fullPage:true});
 await a.goto(B+'/admin/mail?f=spam');await a.click('.mail-row');await a.waitForLoadState();await a.screenshot({path:S+'/mail-phish.png',fullPage:true});
 } finally { await b.close(); w.kill(); }
})().catch(e=>{console.log('ERR',e.message.split('\n')[0]);process.exit(1)});
