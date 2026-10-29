/**
 * /track — clients check the status of their request with their reference
 * number and the email address they applied with. Shows the stage and dates
 * only (no documents, notes or personal details). Failed lookups are logged
 * and limited per IP address to stop guessing.
 */
import { statusInfo, statusesFor } from './_lib/cases.js';
import { esc } from './_lib/admin-views.js';

const MAX_FAILED_PER_HOUR = 10;

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin'
};

function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric' });
}

function layout(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Track Your Application | Awal Global Consults</title>
<meta name="description" content="Check the progress of your application with Awal Global Consults using your reference number.">
<link rel="icon" type="image/png" href="/assets/images/favicon.png">
<style>
:root{--navy:#0F3A5F;--navy-dark:#0A2C48;--blue:#2F80ED;--bg:#F4F8FC;--line:#D7E6F2;--text:#222;--muted:#555}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 "DM Sans",-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
header{background:var(--navy-dark);padding:14px 16px}
header a{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:700;max-width:640px;margin:0 auto}
header img{height:34px}
main{max-width:640px;margin:0 auto;padding:24px 16px 48px}
h1{font-family:Georgia,"Fraunces",serif;color:var(--navy);font-size:26px;margin:0 0 6px}
.lead{color:var(--muted);margin:0 0 18px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:14px}
label{display:block;font-weight:600;margin:12px 0 4px}
input{font:inherit;width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px}
button,.btn{display:inline-block;font:inherit;font-weight:700;padding:11px 18px;border-radius:10px;border:0;background:var(--blue);color:#fff;text-decoration:none;margin-top:16px;cursor:pointer}
.btn.wa{background:#25d366}
.err{background:#fdf0f0;color:#c0392b;border-radius:10px;padding:10px 14px;margin-bottom:12px}
.ref{font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--blue)}
.status{font-size:22px;font-weight:700;color:var(--navy);margin:2px 0 6px}
.steps{list-style:none;margin:16px 0 0;padding:0}
.steps li{display:flex;gap:10px;align-items:flex-start;padding:7px 0;color:var(--muted)}
.steps li .dot{flex:none;width:12px;height:12px;border-radius:50%;border:2px solid var(--line);margin-top:6px}
.steps li.done{color:var(--text)}
.steps li.done .dot{background:var(--blue);border-color:var(--blue)}
.steps li.now{color:var(--navy);font-weight:700}
.steps li.now .dot{background:#fff;border-color:var(--blue);box-shadow:0 0 0 3px #cfe3f7}
.meta{color:var(--muted);font-size:13px}
a{color:var(--navy)}
</style>
</head>
<body>
<header><a href="/"><img src="/assets/images/logo-white.png" alt="">Awal Global Consults</a></header>
<main>${body}</main>
</body>
</html>`;
}

function formHtml({ reference = '', email = '', error = '' } = {}) {
  return `
  <h1>Track your application</h1>
  <p class="lead">Enter the reference number from your confirmation email (for example AGC-2026-0001) and the email address you applied with.</p>
  <div class="card">
    ${error ? `<div class="err">${esc(error)}</div>` : ''}
    <form method="post" action="/track">
      <label for="ref">Reference number</label>
      <input id="ref" name="reference" required maxlength="20" autocapitalize="characters" placeholder="AGC-2026-0001" value="${esc(reference)}">
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" required maxlength="254" autocomplete="email" value="${esc(email)}">
      <button type="submit">Check status</button>
    </form>
  </div>
  <p class="meta">Can't find your reference? <a href="https://wa.me/2347038336596?text=${encodeURIComponent('Hello, I want to check the status of my application')}">Ask us on WhatsApp</a>.</p>`;
}

function resultHtml(c) {
  const info = statusInfo(c.kind, c.status);
  // Main path of stages up to delivery; side stages only appear while they are current
  const path = statusesFor(c.kind).filter(s =>
    s.key === c.status || !['closed', 'cancelled', 'converted', 'awaiting_documents'].includes(s.key));
  const currentIndex = path.findIndex(s => s.key === c.status);
  const steps = c.status === 'cancelled' ? '' : path.map((s, i) => {
    const cls = i === currentIndex ? 'now' : (i < currentIndex ? 'done' : '');
    return `<li class="${cls}"><span class="dot"></span><span>${esc(s.label === 'New' ? 'Received' : s.label)}</span></li>`;
  }).join('');
  return `
  <h1>Your application</h1>
  <div class="card">
    <div class="ref">Reference ${esc(c.reference)}</div>
    <div class="status">${esc(info.label === 'New' ? 'Received' : info.label)}</div>
    ${info.client ? `<p>${esc(info.client)}</p>` : ''}
    <p class="meta">${esc(c.services || '')}<br>Submitted ${fmtDay(c.created_at)} · last update ${fmtDay(c.status_changed_at || c.created_at)}</p>
    <ul class="steps">${steps}</ul>
    <a class="btn wa" href="https://wa.me/2347038336596?text=${encodeURIComponent(`Hello, about my application ${c.reference}`)}">Ask about this on WhatsApp</a>
  </div>
  <p class="meta"><a href="/track">Check another reference</a></p>`;
}

export async function onRequestGet() {
  return new Response(layout(formHtml()), { headers: HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return new Response(layout(formHtml({ error: 'Tracking is not available right now. Please contact us on WhatsApp.' })), { status: 503, headers: HEADERS });

  const form = await request.formData();
  const reference = String(form.get('reference') || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 20);
  const email = String(form.get('email') || '').trim().toLowerCase().slice(0, 254);
  const ip = request.headers.get('CF-Connecting-IP');
  const now = new Date().toISOString();

  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const failed = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'track.failed' AND ip IS ?1 AND at > ?2")
    .bind(ip, hourAgo).first();
  if (failed && failed.n >= MAX_FAILED_PER_HOUR) {
    return new Response(layout(formHtml({ reference, email, error: 'Too many attempts. Please try again in an hour, or ask us on WhatsApp.' })), { status: 429, headers: HEADERS });
  }

  const c = await env.DB.prepare(
    `SELECT c.id, c.reference, c.kind, c.services, c.status, c.created_at, c.status_changed_at
     FROM cases c JOIN clients cl ON cl.id = c.client_id
     WHERE c.reference = ?1 AND cl.email = ?2 AND cl.anonymised_at IS NULL`
  ).bind(reference, email).first();

  if (!c) {
    await env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, 'client', 'track.failed', 'case', NULL, ?2, ?3)")
      .bind(now, JSON.stringify({ reference }), ip).run();
    return new Response(layout(formHtml({ reference, email, error: 'We could not find an application with that reference and email address. Please check both and try again.' })), { status: 404, headers: HEADERS });
  }

  await env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, 'client', 'case.tracked', 'case', ?2, ?3, ?4)")
    .bind(now, c.id, JSON.stringify({ reference: c.reference }), ip).run();
  return new Response(layout(resultHtml(c)), { headers: HEADERS });
}
