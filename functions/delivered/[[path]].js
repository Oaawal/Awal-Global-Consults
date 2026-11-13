/**
 * /delivered/<docId>/<signature> : a client downloads a finished document we gave them
 * (certificate, status report, TIN slip). Only documents marked as delivered can be fetched
 * this way, never what the client uploaded, and never after the case is erased.
 */
import { verifyDeliveredLink } from '../_lib/upload-links.js';
import { documentContentType } from '../_lib/cases.js';
import { publicPage } from '../_lib/public-page.js';

export async function onRequestGet({ env, params }) {
  const [docId, sig] = [].concat(params.path || []);
  const gone = () => {
    const r = publicPage({ title: 'Link not available', heading: 'This link is not available', body: '<p>The document may have been replaced or the link copied incorrectly. Check the latest email from us, or reply to it and we will send it again.</p>' }, 404);
    r.headers.set('X-Robots-Tag', 'noindex, nofollow'); r.headers.set('Cache-Control', 'no-store');
    return r;
  };
  if (!env.DB || !env.DOCS || !docId || !(await verifyDeliveredLink(env, docId, sig))) return gone();
  const d = await env.DB.prepare(
    `SELECT d.file_name, d.storage_key FROM documents d JOIN cases c ON c.id = d.case_id
     WHERE d.id = ?1 AND d.deleted_at IS NULL AND c.purged_at IS NULL AND d.file_name LIKE 'delivered-%'`
  ).bind(docId).first();
  const obj = d ? await env.DOCS.get(d.storage_key) : null;
  if (!obj) return gone();
  const name = d.file_name.replace(/^delivered-[a-z0-9-]*--/, '');
  return new Response(obj.body, {
    headers: {
      'Content-Type': documentContentType(d.file_name),
      'Content-Disposition': `attachment; filename="${name.replace(/["\\\r\n]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}
