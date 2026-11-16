const crypto = require('crypto'); const fs = require('fs'); const S = process.argv[2]; const B = 'http://127.0.0.1:8788/whatsapp/webhook';
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const log = () => fs.existsSync(S + '/wa.log') ? fs.readFileSync(S + '/wa.log', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0;
async function send(text, { from = '2348011116666', type = 'text', sig } = {}) {
  const msg = { from, id: 'wamid.T' + (++n) + Date.now(), timestamp: '1', type, ...(type === 'text' ? { text: { body: text } } : { image: { id: 'img1' } }) };
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '1588064886013001', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: '1289545104233657' }, contacts: [{ wa_id: from, profile: { name: 'Tunde' } }], messages: [msg] } }] }] });
  const h = sig || 'sha256=' + crypto.createHmac('sha256', 'appsecret').update(body).digest('hex');
  const r = await fetch(B, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': h }, body });
  return { status: r.status, msg, body, h };
}
const replies = (to) => log().filter(l => l.kind === 'graph' && l.body.type === 'text' && l.body.to === to).map(l => l.body.text.body);
(async () => {
  let r = await fetch(B + '?hub.mode=subscribe&hub.verify_token=vtok&hub.challenge=12345'); ok(r.status === 200 && await r.text() === '12345', 'Meta webhook check answered');
  r = await fetch(B + '?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1'); ok(r.status === 403, 'wrong verify token refused');
  let s = await send('Hi', { sig: 'sha256=' + '0'.repeat(64) }); ok(s.status === 401, 'unsigned / forged delivery refused');
  s = await send('Hi there'); ok(s.status === 200, 'signed delivery accepted'); await sleep(1500);
  const c1 = log().filter(l => l.kind === 'claude')[0];
  ok(c1 && c1.model === 'claude-opus-5-5' && c1.effort === 'low' && c1.sysCache && c1.topCache && c1.fallbacks === 'default' && c1.headers.beta === 'server-side-fallback-2026-07-01' && c1.headers.v === '2026-10-21', 'Claude request: model, effort, caching, fallbacks, headers');
  ok(JSON.stringify(c1.last).includes('automated assistant') && JSON.stringify(c1.last).includes('privacy'), 'first message carries the privacy/assistant note');
  ok(replies('2348011116666').some(t => t.startsWith('Hello!')), 'reply sent to WhatsApp');
  ok(log().some(l => l.kind === 'graph' && l.body.status === 'read' && l.auth === 'Bearer tok'), 'message marked read with typing indicator, token used');
  // duplicate delivery (Meta retry)
  const before = log().filter(l => l.kind === 'claude').length;
  await fetch(B, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': s.h }, body: s.body }); await sleep(1200);
  ok(log().filter(l => l.kind === 'claude').length === before, 'duplicate delivery ignored');
  // second message remembers history
  await send('and another thing'); await sleep(1500);
  ok(replies('2348011116666').some(t => /msgs=3/.test(t)), 'conversation remembered (history sent)');
  // quote tool
  await send('I want a quote please'); await sleep(2500);
  const q = replies('2348011116666').find(t => t.startsWith('Result:') && t.includes('reference'));
  ok(!!q && /AGC-\d{4}-\d{4}/.test(q), 'quote request created a case: ' + (q || '').slice(0, 90));
  const ref = (q || '').match(/AGC-\d{4}-\d{4}/)[0];
  const em = JSON.parse('[' + fs.readFileSync(S + '/emails.jsonl', 'utf8').trim().split('\n').join(',') + ']').reverse().find(e => (e.subject || '').includes(ref));
  ok(!!em && /WhatsApp quote request/.test(em.subject), 'office emailed: ' + (em && em.subject));
  await send('I want a quote again'); await sleep(2000);
  ok(replies('2348011116666').some(t => t.includes('already_requested')), 'no duplicate case in the same chat');
  // tracking
  await send(`status of ${ref} tunde@gmail.com`); await sleep(2000);
  ok(replies('2348011116666').some(t => t.includes('"found":true') && t.includes('Limited Company Registration')), 'tracking with reference + email works');
  await send(`status of ${ref} wrong@gmail.com`); await sleep(2000);
  ok(replies('2348011116666').some(t => t.includes('"found":false')), 'wrong email reveals nothing');
  // handoff
  await send('I need a person now'); await sleep(2000);
  ok(log().some(l => l.kind === 'graph' && l.body.to === '2348011116666' && l.body.type === 'interactive' && l.body.interactive.type === 'cta_url' && l.body.interactive.action.parameters.url.startsWith('https://wa.me/2347038336596?text=')), 'handoff sends the Chat with an agent button');
  // image
  await send('', { type: 'image', from: '2348099996666' }); await sleep(1500);
  const c = log().filter(l => l.kind === 'claude').at(-1); ok(JSON.stringify(c.last).includes('photo that this assistant cannot read'), 'photo explained to the assistant');
  // Claude down -> apology
  await send('boom', { from: '2348077774444' }); await sleep(1500);
  ok(replies('2348077774444').some(t => t.includes('703 833 6596')), 'API failure still answers with the human number');
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
