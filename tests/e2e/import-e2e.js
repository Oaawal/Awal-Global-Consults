const { chromium } = require('playwright');const fs=require('fs');const S=process.argv[2];const B='http://127.0.0.1:8788';
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
 await p.addInitScript(()=>{try{localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 await p.goto(B+'/admin/login');await p.fill('#email','info@awalglobal.com.ng');await p.click('button[type=submit]');
 const code=emails().filter(e=>e.subject.includes('login code')).at(-1).subject.match(/(\d{6})/)[1];await p.fill('#code',code);await p.click('button[type=submit]');await p.waitForURL(B+'/admin/');
 await p.goto(B+'/admin/records');const before=Number((await p.textContent('#ndpc-count .stat-num')).trim());ok(!isNaN(before),'Records shows NDPC count: '+before+' in last 6 months');
 await p.goto(B+'/admin/clients');await p.click('text=Add past clients');ok(p.url().endsWith('/admin/import'),'Add past clients page opens from Clients');
 const [dl]=await Promise.all([p.waitForEvent('download'),p.click('text=Download the template')]);ok(/template\.csv$/.test(dl.suggestedFilename()),'template downloads: '+dl.suggestedFilename());
 // one by hand
 await p.fill('#i-name','Ifeoma Nwosu');await p.fill('#i-phone','08077778888');await p.fill('#i-service','SCUML Registration');
 const d=new Date(Date.now()-20*86400000).toISOString().slice(0,10);await p.fill('#i-date',d);await p.fill('#i-people','Uche Nwosu');await p.click('form[action="/admin/import/one"] button');
 await p.waitForLoadState();ok(/\/admin\/case\//.test(p.url())&&(await p.textContent('body')).includes('Past client added'),'single past client added → case page');
 ok((await p.textContent('body')).includes('AGC-'+d.slice(0,4)),'reference uses the service year');
 // CSV twice
 for (const run of [1,2]) {
  await p.goto(B+'/admin/import');await p.setInputFiles('#i-file',S+'/past.csv');await p.click('form[action="/admin/import/csv"] button');await p.waitForLoadState();
  const t=(await p.textContent('.card')).replace(/\s+/g,' ');console.log('  run',run,':',t.match(/\d+ added · \d+ already recorded · \d+ with problems/)[0]);
  if(run===1) ok(/3 added · 0 already recorded · 1 with problems/.test(t)&&/Row 4/.test(t),'CSV import: 3 added, bad row 4 reported');
  else ok(/0 added · 3 already recorded · 1 with problems/.test(t),'second upload skips duplicates');
 }
 await p.goto(B+'/admin/records');const after=Number((await p.textContent('#ndpc-count .stat-num')).trim());
 ok(after===before+6,`count rose by 6 (Ifeoma+Uche, Kemi, Tunde+Sade+Femi; 400-day-old record excluded): ${before} → ${after}`);
 await p.screenshot({path:S+'/ndpc-count.png',clip:{x:0,y:0,width:1280,height:900}});
 await b.close();})();
