const http = require('http'); const fs = require('fs'); const LOG = process.argv[2];
const log = o => fs.appendFileSync(LOG, JSON.stringify(o) + '\n');
http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const body = b ? JSON.parse(b) : {};
    if (req.url.startsWith('/v1/messages')) {
      log({ kind: 'claude', headers: { v: req.headers['anthropic-version'], beta: req.headers['anthropic-beta'], key: !!req.headers['x-api-key'] }, model: body.model, effort: body.output_config && body.output_config.effort, sysCache: !!(body.system && body.system[0].cache_control), topCache: !!body.cache_control, fallbacks: body.fallbacks, nmsg: body.messages.length, last: body.messages.at(-1) });
      const last = body.messages.at(-1); const lc = last.content; const lastText = (Array.isArray(lc) ? (lc.find(x => x.type === 'text') || {}).text || '' : lc).replace(/\[[^\]]*\]/g, '');
      const isResult = Array.isArray(lc) && lc[0].type === 'tool_result';
      let out;
      if (isResult) out = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'Result: ' + lc[0].content.slice(0, 300) }] };
      else if (/quote/i.test(lastText)) out = { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: 'request_quote', input: { full_name: 'Tunde Bakare', email: 'tunde@gmail.com', services: ['Limited Company Registration'], details: '2 directors' } }] };
      else if (/status/i.test(lastText)) out = { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu2', name: 'track_application', input: { reference: (lastText.match(/AGC-\d{4}-\d{4}/) || ['AGC-0000-0000'])[0], email: (lastText.match(/\S+@\S+/) || [''])[0] } }] };
      else if (/person/i.test(lastText)) out = { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu3', name: 'talk_to_person', input: { summary: 'Wants to discuss a dispute', urgent: true } }] };
      else if (/boom/i.test(lastText)) { res.writeHead(500); return res.end('{"error":"boom"}'); }
      else out = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hello! I am the automated assistant. (msgs=' + body.messages.length + ')' }] };
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: body.model, usage: {}, ...out }));
    }
    log({ kind: 'graph', url: req.url, auth: req.headers.authorization, body });
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"messages":[{"id":"wamid.x"}]}');
  });
}).listen(9922, () => console.log('mock on 9922'));
