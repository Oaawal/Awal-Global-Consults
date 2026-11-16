const crypto = require('crypto'); const fs = require('fs'); const S = process.argv[2]; const B = 'http://127.0.0.1:8788/whatsapp/webhook';
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const log = () => fs.existsSync(S + '/wa.log') ? fs.readFileSync(S + '/wa.log', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const sleep = ms => new Promise(r => setTimeout(r, ms)); let n = 0; const FROM = '2348022225555';
async function send(m) {
  const msg = { from: FROM, id: 'wamid.M' + (++n) + Date.now(), timestamp: '1', ...m };
  const body = JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1289545104233657' }, contacts: [{ wa_id: FROM, profile: { name: 'Ngozi Okafor' } }], messages: [msg] } }] }] });
  await fetch(B, { method: 'POST', headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', 'appsecret').update(body).digest('hex') }, body }); await sleep(900);
}
const text = t => send({ type: 'text', text: { body: t } });
const tap = (id, kind = 'button_reply') => send({ type: 'interactive', interactive: { type: kind, [kind]: { id, title: id } } });
const out = () => log().filter(l => l.kind === 'graph' && l.body.to === FROM);
const last = () => out().at(-1).body;
(async () => {
  await text('Good morning');
  let b = last(); ok(log().every(l => l.kind !== 'claude'), 'no AI call without a key');
  ok(b.type === 'interactive' && b.interactive.type === 'button' && b.interactive.action.buttons.map(x => x.reply.title).join('|') === 'Get a quotation|Track application|Talk to a person', 'menu with 3 buttons');
  ok(b.interactive.body.text.includes('Hello Ngozi') && b.interactive.body.text.includes('privacy'), 'greeting by name with privacy line');
  await tap('quote'); ok(last().text.body.includes('full name'), 'asks full name');
  await text('Ngozi Okafor'); ok(last().text.body.includes('email'), 'asks email');
  await text('ngozi@bad'); ok(last().text.body.includes("doesn't look right"), 'bad email caught');
  await text('ngozi@gmail.com'); b = last(); ok(b.type === 'interactive' && b.interactive.type === 'list' && b.interactive.action.sections[0].rows.length === 10 && b.interactive.action.sections[0].rows.every(r => r.title.length <= 24), 'service list (10 rows, titles fit)');
  await text('company'); ok(last().interactive && last().interactive.type === 'list', 'typing instead of picking shows the list again');
  await tap('svc_ltd', 'list_reply'); ok(last().text.body.includes('Anything we should know'), 'asks for details');
  await text('2 directors, share capital 1m'); await sleep(800);
  const t = last().text.body; const ref = (t.match(/AGC-\d{4}-\d{4}/) || [])[0];
  ok(!!ref && t.includes('/kyc/?c='), 'case created with reference and private application link: ' + ref);
  const em = fs.readFileSync(S + '/emails.jsonl', 'utf8').trim().split('\n').map(JSON.parse).reverse().find(e => (e.subject || '').includes(ref));
  ok(!!em && em.html.includes('2 directors'), 'office emailed with the details');
  await tap('quote'); ok(last().text.body.includes('already have your quotation request'), 'no duplicate quote');
  await tap('track'); ok(last().text.body.includes('/track'), 'tracking link');
  await tap('person'); { const b = last(); ok(b.type === 'interactive' && b.interactive.type === 'cta_url' && b.interactive.action.parameters.display_text === 'Chat with an agent' && decodeURIComponent(b.interactive.action.parameters.url).includes('Reference: AGC-'), 'person: Chat with an agent button, message pre-typed'); console.log(decodeURIComponent(b.interactive.action.parameters.url)); }
  const em2 = fs.readFileSync(S + '/emails.jsonl', 'utf8').trim().split('\n').map(JSON.parse).reverse().find(e => /asked for a person|needs you/i.test(e.subject + e.html)); ok(!!em2, 'office alerted for the handover');
  await send({ type: 'image', image: { id: 'x' } }); ok(out().slice(-2)[0].body.text && out().slice(-2)[0].body.text.body.includes('only read text'), 'photo explained, menu shown');
  await text('random words'); ok(last().interactive && last().interactive.type === 'button', 'unknown text shows the menu');
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
