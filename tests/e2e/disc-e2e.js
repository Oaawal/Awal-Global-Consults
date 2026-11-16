const { chromium, request: pwreq } = require('playwright');const fs=require('fs');const { execFileSync }=require('child_process');const S=process.argv[2];const B='http://127.0.0.1:8788';
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
const emails=()=>fs.readFileSync(S+'/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
(async()=>{const api=await pwreq.newContext();
 const r=await api.post(B+'/submit-kyc',{multipart:{Intake:'quick',Full_Name:'Tobi Adeyemi',Phone:'08031239999',Email:'tobi@gmail.com',Services_Requested:'NDPC Registration (Data Controller / Processor)',Declaration_Accurate:'Yes',Declaration_Consent:'Yes'}});
 const ref=(await r.json()).reference;
 const b=await chromium.launch();const a=await b.newPage({viewport:{width:390,height:844}});await a.addInitScript(()=>{try{localStorage.setItem('agc_app_panel','hide')}catch(e){}});
 await a.goto(B+'/admin/login');await a.fill('#email','info@awalglobal.com.ng');await a.click('button[type=submit]');
 const code=emails().filter(e=>/login code/.test(e.subject)).at(-1).subject.match(/(\d{6})/)[1];await a.fill('#code',code);await a.click('button[type=submit]');await a.waitForURL(B+'/admin/');
 const caseUrl=emails().filter(e=>e.subject.includes(ref)).map(e=>(e.html||'').match(/\/admin\/case\/[0-9a-f-]{36}/)).filter(Boolean)[0][0];
 await a.goto(B+caseUrl+'?tab=billing');
 const lines=[['NDPC registration fee (UHL)','250000',true],['NDPC late penalty (50%)','125000',true],['Registration and waiver request','150000',false],['Privacy policy and cookie review','120000',false]];
 for (const [i,[d,u,g]] of lines.entries()) { await a.fill(`input[name=desc_${i}]`,d);await a.fill(`input[name=unit_${i}]`,u); if(g) await a.check(`input[name=gov_${i}]`); }
 await a.click('.disc-box summary');await a.fill('input[name=discount_total]','600000');await a.fill('input[name=discount_label]','Loyalty discount');
 const prev=(await a.textContent('.disc-preview')).replace(/\s+/g,' ');
 ok(prev.includes('Discount −₦45,000')&&prev.includes('Client pays ₦600,000'),'live preview: '+prev);
 await (await a.$('.disc-box')).screenshot({path:S+'/disc-box.png'});
 await a.fill('input[name=discount_total]','100000');ok((await a.textContent('.disc-preview')).includes('can’t be more than your fees'),'warns when discount would cut into government fees');
 await a.fill('input[name=discount_total]','600000');
 await a.click('button[name=send][value="0"]');await a.waitForLoadState();
 let t=(await a.textContent('body')).replace(/\s+/g,' ');ok(t.includes('₦600,000'),'saved quotation total ₦600,000');
 // web view
 const qHref=await a.getAttribute('a[href^="/admin/billing/"]:has-text("Quotation")','href');
 const v=await b.newPage();await v.goto(a.url().split('/admin/')[0]+qHref.replace(/^/,''));
 // (use same context cookies)
 await a.goto(B+qHref);t=(await a.textContent('body')).replace(/\s+/g,' ');
 { const n = t.replace(/\s+/g, ''); ok(n.includes('Subtotal₦645,000')&&n.includes('Loyaltydiscount−₦45,000')&&n.includes('₦600,000'),'web view shows subtotal, discount line and total' + (t.includes('Subtotal ₦645,000') ? '' : ' [page: ' + t.slice(Math.max(0, t.indexOf('Subtotal') - 40), t.indexOf('Subtotal') + 200) + ']')); }
 ok(!/Loyalty discount\s*-?45,000/.test(t.split('Subtotal')[0]),'discount not listed as a service row');
 const pdf=await a.request.get(B+qHref+'/pdf').catch(()=>null);
 // PDF via page download
 const [dl]=await Promise.all([a.waitForEvent('download'),a.evaluate(h=>{const l=document.createElement('a');l.href=h+'/pdf';document.body.appendChild(l);l.click();},qHref)]);
 const path=S+'/disc-quote.pdf';await dl.saveAs(path);const txt=execFileSync('pdftotext',['-layout',path,'-']).toString();
 ok(/Loyalty discount\s+−?₦?\s*45,000/.test(txt.replace(/N(?=\d)/g,'₦'))||txt.includes('Loyalty discount'),'PDF shows the discount line');
 ok(/600,000/.test(txt),'PDF total 600,000');
 // invoice from quote keeps the discount
 await a.goto(B+caseUrl+'?tab=billing');await a.click('text=Make invoice');await a.waitForLoadState();
 ok(await a.inputValue('input[name=discount]')==='45000'&&await a.inputValue('input[name=discount_label]')==='Loyalty discount','invoice form carries the discount over');
 ok(!(await a.inputValue('input[name=desc_4]')),'discount not duplicated as an item line');
 await a.click('button[name=send][value="0"]');await a.waitForLoadState();
 t=(await a.textContent('body')).replace(/\s+/g,' ');ok((t.match(/₦600,000/g)||[]).length>=2,'invoice also ₦600,000');
 await b.close();})().catch(e=>{console.log('ERR',e.message.split('\n')[0]);process.exit(1)});
