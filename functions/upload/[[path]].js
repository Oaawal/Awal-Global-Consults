/**
 * /upload/<caseId>/<signature> : a client adds documents to their open case.
 * GET shows the form; POST saves the files to private storage, logs them on the
 * case, and alerts the admins (short email and phone notification).
 */
import { verifyUploadLink } from '../_lib/upload-links.js';
import { publicPage } from '../_lib/public-page.js';
import { documentContentType } from '../_lib/cases.js';
import { sendBrevoEmail } from '../_lib/brevo.js';
import { adminNoticeEmail } from '../_lib/email-templates.js';
import { notifyAdmins } from '../_lib/webpush.js';

const SITE_URL = 'https://awalglobal.com.ng';
const MAX_FILE = 7 * 1024 * 1024, MAX_TOTAL = 25 * 1024 * 1024, MAX_FILES = 20;
const OPEN = "c.status NOT IN ('closed', 'cancelled', 'converted') AND c.purged_at IS NULL";
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HEADERS = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

function page(body, status = 200) {
  const r = publicPage(body, status);
  for (const [k, v] of Object.entries(HEADERS)) r.headers.set(k, v);
  return r;
}

async function loadCase(env, params) {
  const [caseId, sig] = [].concat(params.path || []);
  if (!caseId || !(await verifyUploadLink(env, caseId, sig))) return null;
  return env.DB.prepare(`SELECT c.id, c.reference, c.services, c.status, ${OPEN} AS open,
    (SELECT COUNT(*) FROM documents d WHERE d.case_id = c.id AND d.deleted_at IS NULL) AS docs
    FROM cases c WHERE c.id = ?1`).bind(caseId).first();
}

function form(c, message = '') {
  return {
    title: `Upload documents: ${c.reference}`,
    heading: 'Upload your documents',
    body: `<p>Reference <strong>${esc(c.reference)}</strong>${c.services ? ` · ${esc(c.services)}` : ''}</p>
      ${message}
      <p>${c.docs ? `We already have <strong>${c.docs}</strong> document${c.docs === 1 ? '' : 's'} for this request. ` : ''}Add any documents we asked for: IDs, certificates, photographs or signatures. PDF, JPG or PNG, up to 7MB each.</p>
      <form method="post" enctype="multipart/form-data" style="margin-top:18px;">
        <label style="display:block;font-weight:600;margin-bottom:6px;" for="what">What are you sending? <span style="font-weight:400;color:#666;">(e.g. NIN slip, LGA certificate)</span></label>
        <input id="what" name="what" maxlength="200" style="width:100%;padding:12px;border:1.5px solid #d5dde6;border-radius:10px;margin-bottom:14px;font:inherit;">
        <input type="file" name="files" multiple required accept=".pdf,.jpg,.jpeg,.png" style="display:block;margin-bottom:16px;">
        <button type="submit" style="background:#0F3A5F;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-weight:700;font:inherit;cursor:pointer;">Upload</button>
      </form>
      <p style="font-size:13px;color:#666;margin-top:18px;">This link is private to your request. For your security we do not accept documents on WhatsApp.</p>`
  };
}

export async function onRequestGet({ env, params }) {
  if (!env.DB) return page({ title: 'Unavailable', heading: 'Uploads are unavailable', body: '<p>Please try again later.</p>' }, 503);
  const c = await loadCase(env, params);
  if (!c) return page({ title: 'Link not valid', heading: 'This upload link is not valid', body: '<p>Please use the link in your latest email from us, or contact us at info@awalglobal.com.ng.</p>' }, 404);
  if (!c.open) return page({ title: 'Request closed', heading: 'This request is closed', body: `<p>Request <strong>${esc(c.reference)}</strong> is closed, so this link no longer accepts documents. Contact us if you need to send something.</p>` }, 410);
  return page(form(c));
}

export async function onRequestPost({ request, env, params }) {
  if (!env.DB || !env.DOCS) return page({ title: 'Unavailable', heading: 'Uploads are unavailable', body: '<p>Please try again later.</p>' }, 503);
  const c = await loadCase(env, params);
  if (!c) return page({ title: 'Link not valid', heading: 'This upload link is not valid', body: '<p>Please use the link in your latest email from us.</p>' }, 404);
  if (!c.open) return page({ title: 'Request closed', heading: 'This request is closed', body: '<p>This link no longer accepts documents.</p>' }, 410);
  let fd;
  try { fd = await request.formData(); } catch (e) { return page(form(c, '<p style="color:#b42318;">The upload could not be read. Please try again.</p>'), 400); }
  const what = String(fd.get('what') || '').trim().slice(0, 200);
  const prefix = what ? what.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '--' : 'client-upload--';
  const files = fd.getAll('files').filter(f => typeof f !== 'string' && f.size > 0).slice(0, MAX_FILES);
  const saved = [], skipped = [];
  let total = 0;
  const now = new Date().toISOString();
  const stmts = [];
  for (const f of files) {
    const name = prefix + String(f.name || 'file').replace(/[\\/\r\n\0]/g, '_').slice(0, 100);
    if (!/\.(pdf|jpe?g|png)$/i.test(name) || f.size > MAX_FILE || total + f.size > MAX_TOTAL) { skipped.push(f.name); continue; }
    total += f.size;
    const docId = crypto.randomUUID();
    const key = `case/${c.id}/${docId}`;
    await env.DOCS.put(key, new Uint8Array(await f.arrayBuffer()), { httpMetadata: { contentType: documentContentType(name) }, customMetadata: { caseId: c.id, docId, fileName: name } });
    stmts.push(env.DB.prepare('INSERT INTO documents (id, case_id, file_name, content_type, size_bytes, storage_key, uploaded_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(docId, c.id, name, documentContentType(name), f.size, key, now));
    saved.push(name);
  }
  if (!saved.length) return page(form(c, `<p style="color:#b42318;">No files were received.${skipped.length ? ' Use PDF, JPG or PNG files under 7MB each.' : ''}</p>`), 400);
  const note = `Client uploaded ${saved.length} document${saved.length === 1 ? '' : 's'}${what ? ` (${what})` : ''} with their upload link.`;
  stmts.push(env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'documents_added', ?2, 'client:upload-link', ?3)").bind(c.id, note, now));
  stmts.push(env.DB.prepare('UPDATE cases SET updated_at = ?2 WHERE id = ?1').bind(c.id, now));
  stmts.push(env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, 'client:upload-link', 'document.uploaded', 'case', ?2, ?3, ?4)")
    .bind(now, c.id, JSON.stringify({ reference: c.reference, files: saved.length }), request.headers.get('CF-Connecting-IP')));
  await env.DB.batch(stmts);

  const caseUrl = `${SITE_URL}/admin/case/${c.id}?tab=documents`;
  try {
    await sendBrevoEmail(env, { to: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' }, subject: `[${c.reference}] Client uploaded ${saved.length} document${saved.length === 1 ? '' : 's'}`,
      html: adminNoticeEmail({ heading: 'New documents from a client', reference: c.reference, services: c.services ? [c.services] : [], lines: [what ? `They said: ${what}` : 'Uploaded with their private link.'], caseUrl }) });
  } catch (err) { console.error('upload: admin email failed:', err && err.message); }
  await notifyAdmins(env, { title: `Documents received · ${c.reference}`, body: `${saved.length} file${saved.length === 1 ? '' : 's'}${what ? `: ${what}` : ''}`, url: `/admin/case/${c.id}?tab=documents`, tag: `upload-${c.reference}` });

  return page(form({ ...c, docs: c.docs + saved.length }, `<p style="color:#1E6B3A;background:#DDF2E3;border-radius:8px;padding:10px 14px;"><strong>Thank you.</strong> We received ${saved.length} document${saved.length === 1 ? '' : 's'}${skipped.length ? `; ${skipped.length} could not be received (PDF, JPG or PNG under 7MB only)` : ''}. You can add more below.</p>`));
}
