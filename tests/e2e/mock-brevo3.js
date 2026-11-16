const http=require('http'),fs=require('fs');const out=process.argv[2];
http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{res.setHeader('content-type','application/json');
 if(req.url.startsWith('/v3/webhooks')){res.statusCode=201;return res.end('{"id":4242}');}
 try{const j=JSON.parse(b);fs.appendFileSync(out,JSON.stringify({to:j.to,subject:j.subject,html:j.htmlContent,attachment:j.attachment||[]})+'\n')}catch(e){}
 res.end('{"messageId":"x"}')})}).listen(9911,'127.0.0.1');
