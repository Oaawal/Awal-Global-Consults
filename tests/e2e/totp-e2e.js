// Authenticator app sign-in: set up with a QR/key, sign in with app codes, one-time recovery codes
const { chromium } = require('playwright');const fs=require('fs');const crypto=require('crypto');const S=process.argv[2];const B='http://127.0.0.1:8788';
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const txt=async p=>(await p.textContent('body')).replace(/\s+/g,' ');
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32d=s=>{let bits=0,val=0;const out=[];for(const c of s.replace(/\s/g,'')){val=(val<<5)|B32.indexOf(c);bits+=5;if(bits>=8){out.push((val>>>(bits-8))&255);bits-=8}}return Buffer.from(out)};
const code=(secret,offset=0)=>{const ctr=Math.floor(Date.now()/1000/30)+offset;const buf=Buffer.alloc(8);buf.writeUInt32BE(Math.floor(ctr/2**32),0);buf.writeUInt32BE(ctr>>>0,4);
 const h=crypto.createHmac('sha1',b32d(secret)).update(buf).digest();const o=h[h.length-1]&15;return String((((h[o]&127)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3])%1e6).padStart(6,'0')};
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});const a=await ctx.newPage();await a.addInitScript(()=>{try{localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 // Without an app linked, app codes do nothing
 await a.goto(B+'/admin/login?app=1');await a.fill('#email','info@awalglobal.com.ng');await a.fill('#code','123456');await a.click('button[type=submit]');
 ok((await txt(a)).includes('That code is not right'),'app sign-in refused before set-up');
 // Sign in by email, then link the app
 await a.goto(B+'/admin/login');await a.fill('#email','info@awalglobal.com.ng');await a.click('button[type=submit]');
 const c1=emails().filter(e=>/login code/.test(e.subject)).at(-1).subject.match(/(\d{6})/)[1];await a.fill('#code',c1);await a.click('button[type=submit]');await a.waitForURL(B+'/admin/');
 await a.click('.topbar a[href="/admin/settings"]');await a.waitForLoadState();
 ok((await txt(a)).includes('Set up authenticator app'),'settings page offers the authenticator');
 await a.click('button:has-text("Set up authenticator app")');await a.waitForLoadState();
 ok(await a.locator('.qr svg').count()===1,'QR code shown');
 const href=await a.getAttribute('a[href^="otpauth://"]','href');ok(/^otpauth:\/\/totp\/Awal%20Global%3Ainfo%40awalglobal\.com\.ng\?secret=[A-Z2-7]{32}&issuer=Awal%20Global/.test(href),'link opens the authenticator app on a phone');
 const secret=(await a.textContent('code')).replace(/\s/g,'');ok(href.includes(secret),'key shown for typing by hand matches');
 await a.fill('#t-code','000000');await a.click('button:has-text("Turn on")');await a.waitForLoadState();ok((await txt(a)).includes('That code did not match'),'wrong set-up code refused');
 await a.fill('#t-code',code(secret));await a.click('button:has-text("Turn on")');await a.waitForLoadState();
 const rec=(await a.textContent('pre.recovery')).trim().split('\n');ok(rec.length===10&&/^[a-z2-7]{4}-[a-z2-7]{4}$/.test(rec[0]),'ten recovery codes shown once');
 await a.goto(B+'/admin/settings');ok((await txt(a)).includes('10 recovery codes left')&&!(await txt(a)).includes(rec[0]),'codes not shown again');
 // Sign out, sign in with the app on a "new device"
 await a.click('.topbar form[action="/admin/logout"] button');await a.waitForLoadState();
 const d=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
 await d.goto(B+'/admin/login');await d.click('a:has-text("Use your authenticator app instead")');await d.fill('#email','info@awalglobal.com.ng');
 await d.fill('#code',code(secret,1));await d.click('button[type=submit]');await d.waitForLoadState();
 ok(d.url()===B+'/admin/','signed in with the app code, no email needed');
 const before=emails().length;
 // The same code cannot be used twice
 const d2=await (await b.newContext()).newPage();await d2.goto(B+'/admin/login?app=1');await d2.fill('#email','info@awalglobal.com.ng');await d2.fill('#code',code(secret,1));await d2.click('button[type=submit]');
 ok((await txt(d2)).includes('That code is not right'),'a code works only once');
 // Recovery code works once
 await d2.fill('#email','info@awalglobal.com.ng');await d2.fill('#code',rec[3]);await d2.click('button[type=submit]');await d2.waitForLoadState();
 ok(/\/admin\/settings/.test(d2.url())&&(await txt(d2)).includes('recovery code'),'recovery code signs in and warns');
 ok((await txt(d2)).includes('9 recovery codes left'),'one recovery code used up');
 const d3=await (await b.newContext()).newPage();await d3.goto(B+'/admin/login?app=1');await d3.fill('#email','info@awalglobal.com.ng');await d3.fill('#code',rec[3]);await d3.click('button[type=submit]');
 ok((await txt(d3)).includes('That code is not right'),'a recovery code works only once');
 ok(emails().slice(before).some(e=>/sign-in|signed in|new device/i.test(e.subject)),'admins are alerted about the recovery sign-in');
 // Not an admin
 await d3.fill('#email','someone@example.com');await d3.fill('#code',code(secret,1));await d3.click('button[type=submit]');ok((await txt(d3)).includes('That code is not right'),'other addresses cannot use it');
 // Activity
 await d.goto(B+'/admin/activity');ok((await txt(d)).length>0,'activity page loads');
 // Remove it
 await d.goto(B+'/admin/settings');d.once('dialog',x=>x.accept());await d.click('button:has-text("Remove authenticator")');await d.waitForLoadState();
 ok((await txt(d)).includes('Authenticator app removed'),'authenticator can be removed');
 await b.close();})().catch(e=>{console.log('ERR',e.message.split('\n')[0]);process.exit(1)});
