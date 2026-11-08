/**
 * /billing/<docId>/<signature>      : a client views their quotation, invoice, receipt or letter
 * /billing/<docId>/<signature>/pdf  : the same document as a PDF download
 */
import { verifyDocLink, renderDoc, relatedDocs } from '../_lib/billing.js';
import { renderPdf, pdfFilename } from '../_lib/billing-pdf.js';

const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'";
const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP };

export async function onRequestGet({ env, params }) {
  const [id, sig, extra] = [].concat(params.path || []);
  if (extra !== undefined && extra !== 'pdf') return new Response('Not found', { status: 404 });
  if (!env.DB || !(await verifyDocLink(env, id, sig))) return new Response('This link is not valid. Please use the link in your latest email from Awal Global Consults.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
  const doc = await env.DB.prepare('SELECT * FROM billing_docs WHERE id = ?1').bind(id).first();
  if (!doc) return new Response('Not found', { status: 404 });
  const related = await relatedDocs(env, doc);
  await env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, 'client:billing-link', ?2, 'billing', ?3, ?4, NULL)")
    .bind(new Date().toISOString(), extra === 'pdf' ? 'billing.pdf' : 'billing.viewed', doc.id, JSON.stringify({ number: doc.number })).run();
  if (extra === 'pdf') {
    return new Response(await renderPdf(doc, related), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${pdfFilename(doc)}"`,
      'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
  }
  return new Response(renderDoc(doc, { ...related, pdfUrl: `/billing/${id}/${sig}/pdf` }), { headers: HEADERS });
}
