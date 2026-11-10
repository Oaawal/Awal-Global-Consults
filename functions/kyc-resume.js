/**
 * GET /kyc-resume?c=<caseId>&k=<signature>
 * Used by the application form when a client opens their private "complete your
 * application" link: returns the few details they already gave in their quote request
 * so the form can be pre-filled. Works only for an open application with a valid link.
 */
import { verifyDetailsLink } from './_lib/upload-links.js';
import { isOpen } from './_lib/cases.js';
import { recordsEnabled, awaitingDetails } from './_lib/records.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const id = q.get('c') || '';
  if (!recordsEnabled(env) || !(await verifyDetailsLink(env, id, q.get('k') || ''))) return json({ error: 'invalid' }, 404);
  const c = await env.DB.prepare(
    `SELECT c.id, c.reference, c.services, c.status, c.form_data, cl.full_name, cl.email, cl.phone
       FROM cases c JOIN clients cl ON cl.id = c.client_id
      WHERE c.id = ?1 AND c.kind = 'application' AND c.purged_at IS NULL`).bind(id).first();
  if (!c || !isOpen(c.status)) return json({ error: 'closed' }, 410);
  let f = {};
  try { f = JSON.parse(c.form_data || '{}') || {}; } catch (e) { /* nothing to pre-fill */ }
  await env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, 'client:details-link', 'case.details_opened', 'case', ?2, ?3, ?4)")
    .bind(new Date().toISOString(), c.id, JSON.stringify({ reference: c.reference }), request.headers.get('CF-Connecting-IP')).run();
  return json({
    reference: c.reference,
    completed: !awaitingDetails(c),
    fullName: c.full_name || '', email: c.email || '', phone: c.phone || '',
    services: String(c.services || '').split(',').map(s => s.trim()).filter(Boolean),
    businessName: f['Business Name'] || '', note: f['Business Description'] || ''
  });
}
