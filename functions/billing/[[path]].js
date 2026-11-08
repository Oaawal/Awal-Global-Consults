/** /billing/<docId>/<signature> : a client views (and prints to PDF) their quotation, invoice, receipt or letter. */
import { verifyDocLink, renderDoc } from '../_lib/billing.js';

const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'";
const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP };

export async function onRequestGet({ env, params }) {
  const [id, sig] = [].concat(params.path || []);
  if (!env.DB || !(await verifyDocLink(env, id, sig))) return new Response('This link is not valid. Please use the link in your latest email from Awal Global Consults.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
  const doc = await env.DB.prepare('SELECT * FROM billing_docs WHERE id = ?1').bind(id).first();
  if (!doc) return new Response('Not found', { status: 404 });
  const get = x => x ? env.DB.prepare('SELECT * FROM billing_docs WHERE id = ?1').bind(x).first() : null;
  const rel = await get(doc.related_id);
  const invoice = doc.kind === 'invoice' ? doc : (rel && rel.kind === 'invoice' ? rel : null);
  const quote = invoice && invoice.related_id ? await get(invoice.related_id) : (rel && rel.kind === 'quote' ? rel : null);
  const receipt = doc.kind === 'engagement' && invoice ? await env.DB.prepare("SELECT * FROM billing_docs WHERE related_id = ?1 AND kind = 'receipt' AND status != 'void' ORDER BY created_at DESC LIMIT 1").bind(invoice.id).first() : null;
  await env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, 'client:billing-link', 'billing.viewed', 'billing', ?2, ?3, NULL)")
    .bind(new Date().toISOString(), doc.id, JSON.stringify({ number: doc.number })).run();
  return new Response(renderDoc(doc, { invoice, quote, receipt }), { headers: HEADERS });
}
