const http=require('http'),fs=require('fs');const out=process.argv[2];var mid;
http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{res.setHeader('content-type','application/json');
 if(req.url.startsWith('/v3/webhooks')){res.statusCode=201;return res.end('{"id":4242}');}
 try{const j=JSON.parse(b);mid='<'+Date.now()+'.'+Math.floor(Math.random()*1e6)+'@smtp-relay.mailin.fr>';fs.appendFileSync(out,JSON.stringify({to:j.to,cc:j.cc,sender:j.sender,replyTo:j.replyTo,headers:j.headers,text:j.textContent,subject:j.subject,html:j.htmlContent,attachment:j.attachment||[],messageId:mid})+'\n')}catch(e){}
 res.end(JSON.stringify({messageId:typeof mid==='string'?mid:'x'}))})}).listen(9911,'127.0.0.1');
