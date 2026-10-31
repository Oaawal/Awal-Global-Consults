/**
 * Small branded HTML page for one-off public responses
 * (newsletter confirmation, unsubscribe, booking cancellation).
 */
import { esc } from './admin-views.js';

export const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin'
};

export function publicPage({ title, heading, body, actions = [] }, status = 200) {
  const buttons = actions.map((a, i) =>
    `<a class="btn${i === 0 ? '' : ' ghost'}" href="${esc(a.href)}">${esc(a.label)}</a>`).join('');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Awal Global Consults</title>
<link rel="icon" type="image/png" href="/assets/images/favicon.png">
<style>
:root{--navy:#0F3A5F;--navy-dark:#0A2C48;--blue:#2F80ED;--gold:#C9A646;--bg:#F4F8FC;--line:#D7E6F2;--text:#222;--muted:#555}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 "DM Sans",-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
header{background:var(--navy-dark);padding:14px 16px;border-bottom:3px solid var(--gold)}
header a{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:700;max-width:620px;margin:0 auto}
header img{height:34px}
main{max-width:620px;margin:32px auto;padding:0 16px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:28px}
h1{font-family:Georgia,serif;color:var(--navy);font-size:24px;margin:0 0 12px}
p{margin:0 0 14px}
.btns{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
.btn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px}
.btn.ghost{background:transparent;color:var(--navy);border:1px solid var(--line)}
</style>
</head>
<body>
<header><a href="/"><img src="/assets/images/logo-mark.png" alt="">Awal Global Consults</a></header>
<main><div class="card"><h1>${esc(heading)}</h1>${body}<div class="btns">${buttons}</div></div></main>
</body>
</html>`;
  return new Response(html, { status, headers: PAGE_HEADERS });
}
