/**
 * The dashboard mailbox for info@awalglobal.com.ng.
 *
 * Incoming: the awal-mail Worker (ops/mail-worker.js) stores each raw message in R2 and lists it
 * in mail_messages; readIncoming() here parses it once, runs the security checks and caches the
 * readable parts. Outgoing: sendMail() sends through Brevo from info@ and keeps a copy.
 *
 * Security in short:
 *  - sender checks come from Cloudflare's own SPF/DKIM/DMARC result, not headers the sender wrote;
 *  - lookalike domains, fake "Awal" display names, a different Reply-To, deceptive links,
 *    bank-detail-change wording and risky attachments are flagged on the message;
 *  - email HTML is cleaned and then shown in a sandboxed frame with no scripts, forms or
 *    remote images (images only on request);
 *  - attachments always download as files, never open in the dashboard;
 *  - only signed-in admins can read or send; every send and download is in the audit log.
 */
import PostalMime from './vendor/postal-mime/postal-mime.js';

export const OUR_DOMAIN = 'awalglobal.com.ng';
export const MAIL_FOLDERS = { inbox: 'Inbox', starred: 'Starred', drafts: 'Drafts', sent: 'Sent', archive: 'Archive', spam: 'Spam', trash: 'Trash' };
export const TRASH_DAYS = 30;
export const SEND_LIMIT_PER_HOUR = 60;
export const ATTACH_MAX_TOTAL = 10 * 1024 * 1024;
const INLINE_IMAGE_MAX = 400 * 1024;

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// ── Sending addresses and their signatures ──────────────────────
// Defaults; the names, titles and signature lines can be changed on the Settings page
// (stored in app_settings 'mail_identities'). Every address must be on our own domain.
export const DEFAULT_IDENTITIES = [
  { email: `info@${OUR_DOMAIN}`, name: 'Awal Global Consults', title: 'Client Services', lines: ['Awal Global Consults Limited', 'RC 9282103', 'WhatsApp +234 703 833 6596'] },
  { email: `contact@${OUR_DOMAIN}`, name: 'Awal Global Consults', title: 'Enquiries', lines: ['Awal Global Consults Limited', 'RC 9282103', 'WhatsApp +234 703 833 6596'] },
  { email: `abdullateef@${OUR_DOMAIN}`, name: 'Abdullateef Olamilekan Abdulwaheed', title: 'Founder; Governance, Risk and Compliance', lines: ['Awal Global Consults Limited', 'RC 9282103', 'WhatsApp +234 703 833 6596'] }
];
export async function mailIdentities(env) {
  let saved = null;
  try { const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'mail_identities'").first(); saved = r ? JSON.parse(r.value) : null; } catch (e) {}
  const list = DEFAULT_IDENTITIES.map(d => ({ ...d, ...((saved || []).find(x => x.email === d.email) || {}), email: d.email }));
  // Extra addresses added on the Settings page (still on our domain)
  for (const x of saved || []) if (!list.some(l => l.email === x.email) && String(x.email).endsWith('@' + OUR_DOMAIN)) list.push(x);
  return list;
}
export async function saveIdentities(env, list) {
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('mail_identities', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2")
    .bind(JSON.stringify(list), new Date().toISOString()).run();
}
/** The sender for an address (falls back to info@). */
export const mailFrom = (env, address = null, identities = DEFAULT_IDENTITIES) => {
  const id = identities.find(i => i.email === String(address || '').toLowerCase()) || identities.find(i => i.email === (env.MAIL_FROM || `info@${OUR_DOMAIN}`)) || identities[0];
  return { name: id.name, email: id.email };
};
/** Which of our addresses a message was sent to (to reply from the same one). */
export function ourAddressIn(addrs, identities = DEFAULT_IDENTITIES) {
  const list = String(addrs || '').toLowerCase().split(/[,\s]+/);
  return (identities.find(i => list.includes(i.email)) || identities[0]).email;
}
const NAVY = '#0A2C48', GOLD = '#D4A72C', MUTED = '#5B6B7B';
/** The designed HTML signature for one sender (and a plain-text copy). */
export function signatureFor(identity) {
  const lines = (identity.lines || []).filter(Boolean);
  const html = `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;font-family:Arial,Helvetica,sans-serif;border-collapse:collapse">
<tr><td style="padding:0 14px 0 0;vertical-align:top;border-right:3px solid ${GOLD}"><img src="https://${OUR_DOMAIN}/assets/images/logo-mark.png" width="56" height="49" alt="Awal Global Consults" style="display:block;border:0"></td>
<td style="padding:0 0 0 14px;vertical-align:top">
<div style="font-size:15px;font-weight:bold;color:${NAVY}">${esc(identity.name)}</div>
${identity.title ? `<div style="font-size:12.5px;color:${GOLD};font-weight:bold;margin-top:1px">${esc(identity.title)}</div>` : ''}
${lines.map(l => `<div style="font-size:12.5px;color:${MUTED};margin-top:2px">${esc(l)}</div>`).join('')}
<div style="font-size:12.5px;margin-top:4px"><a href="mailto:${esc(identity.email)}" style="color:${NAVY};text-decoration:none">${esc(identity.email)}</a> &middot; <a href="https://${OUR_DOMAIN}" style="color:${NAVY};text-decoration:none">${OUR_DOMAIN}</a></div>
</td></tr></table>`;
  const text = [identity.name, identity.title, ...lines, `${identity.email} · ${OUR_DOMAIN}`].filter(Boolean).join('\n');
  return { html, text };
}
export const validEmail = s => /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[A-Za-z]{2,}$/.test(String(s || ''));

// ── Attachments ──────────────────────────────────────────────────
const DANGEROUS = /\.(exe|scr|com|pif|bat|cmd|vbs|vbe|js|jse|wsf|wsh|ps1|msi|msp|jar|hta|cpl|lnk|reg|dll|iso|img|vhd|html?|svg|xht(ml)?|shtml|mht(ml)?|apk|app|dmg|sh)$/i;
const MACRO = /\.(docm|xlsm|pptm|dotm|xltm|xlam)$/i;
const ARCHIVE = /\.(zip|rar|7z|tar|gz|tgz|cab|ace)$/i;
export function attachmentRisk(name) {
  const n = String(name || '').toLowerCase().trim();
  if (/\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|txt|csv)\.[a-z0-9]{2,5}$/i.test(n) && DANGEROUS.test(n)) return 'danger'; // invoice.pdf.exe
  if (DANGEROUS.test(n)) return 'danger';
  if (MACRO.test(n) || ARCHIVE.test(n)) return 'caution';
  return 'ok';
}
const safeName = n => String(n || 'attachment').replace(/[\\/\r\n\0"<>|:*?]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'attachment';

// ── Security checks ──────────────────────────────────────────────
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const domainOf = addr => String(addr || '').split('@')[1]?.toLowerCase().replace(/\.$/, '') || '';
const baseDomain = d => { const p = d.split('.'); return p.length > 2 && /^(com|org|gov|edu|net|co|ac)$/.test(p[p.length - 2]) ? p.slice(-3).join('.') : p.slice(-2).join('.'); };

/** Warnings for one incoming message: [{ level: 'danger'|'caution', text }] */
export function securityWarnings({ auth = {}, from = {}, replyTo = [], html = '', text = '', attachments = [] }) {
  const w = [];
  const addr = String(from.address || '').toLowerCase(), dom = domainOf(addr), name = String(from.name || '');
  if (auth.dmarc === 'fail') w.push({ level: 'danger', code: 'forged', text: 'The sender could not be verified (DMARC failed). This email may be forged.' });
  else if (auth.spf === 'fail' && auth.dkim !== 'pass') w.push({ level: 'danger', text: 'The sender could not be verified (SPF failed and no valid signature).' });
  else if (auth.dmarc !== 'pass' && auth.dkim !== 'pass' && auth.spf !== 'pass') w.push({ level: 'caution', text: 'The sender\'s domain is not verified. Be careful with links, attachments and payment requests.' });

  const ourBase = OUR_DOMAIN.split('.')[0];
  if (dom === OUR_DOMAIN || dom.endsWith('.' + OUR_DOMAIN)) {
    if (auth.dmarc !== 'pass') w.push({ level: 'danger', code: 'forged', text: `This claims to come from ${OUR_DOMAIN} but did not pass verification. We did not send it.` });
  } else if (dom) {
    const label = baseDomain(dom).split('.')[0];
    if (label !== ourBase && (lev(label, ourBase) <= 2 || label.includes(ourBase) || lev(dom, OUR_DOMAIN) <= 3))
      w.push({ level: 'danger', code: 'lookalike', text: `The sender's domain (${dom}) looks like ours but is not. This is a common trick.` });
    if (/awal/i.test(name) || name.toLowerCase().includes(OUR_DOMAIN)) w.push({ level: 'danger', code: 'fake_name', text: `The sender's name says "${name}" but the email is from ${dom}, not ${OUR_DOMAIN}.` });
    const nameAddr = (name.match(/[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}/i) || [])[0];
    if (nameAddr && nameAddr.toLowerCase() !== addr) w.push({ level: 'caution', text: `The sender's name shows ${nameAddr} but the email really came from ${addr}.` });
  }
  const rt = (replyTo[0] && replyTo[0].address || '').toLowerCase();
  if (rt && rt !== addr && baseDomain(domainOf(rt)) !== baseDomain(dom)) w.push({ level: 'caution', text: `Replies will go to ${rt}, a different address from the sender's.` });

  // Links whose text shows one website but which really go to another
  const bad = new Set();
  for (const m of String(html).matchAll(/<a\b[^>]*href\s*=\s*["']?(https?:\/\/[^"'\s>]+)[^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    const shown = m[2].replace(/<[^>]+>/g, '').trim().toLowerCase();
    const sm = shown.match(/^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[\/\s]|$)/);
    let real = ''; try { real = new URL(m[1]).hostname.toLowerCase(); } catch (e) {}
    if (sm && real && baseDomain(sm[1]) !== baseDomain(real)) bad.add(`${sm[1]} → ${real}`);
  }
  if (bad.size) w.push({ level: 'danger', text: `Some links show one website but open another: ${[...bad].slice(0, 3).join('; ')}.` });

  const body = (String(text) + ' ' + String(html).replace(/<[^>]+>/g, ' ')).toLowerCase();
  if (/(change|update|new|different)\s+(of\s+)?(our\s+|my\s+)?(bank|account|payment)\s+(details|account|information|number)|(pay|transfer)\s+(in)?to\s+(this|our|the)\s+new\s+account/.test(body))
    w.push({ level: 'caution', text: 'This email mentions changed bank or payment details. Confirm by phone on a number you already have before paying anything.' });
  if (/(verify|confirm|re-?enter|update)\s+(your\s+)?(password|login|account|otp|pin|bvn)/.test(body))
    w.push({ level: 'caution', text: 'This email asks you to confirm a password, PIN, OTP or BVN. Legitimate services do not ask for these by email.' });

  for (const a of attachments) {
    const r = attachmentRisk(a.filename);
    if (r === 'danger') w.push({ level: 'danger', text: `The attachment "${safeName(a.filename)}" is a type that can run programs. Do not open it.` });
    else if (r === 'caution') w.push({ level: 'caution', text: `The attachment "${safeName(a.filename)}" is a compressed file or a document with macros. Only open it if you were expecting it.` });
  }
  return w;
}

// ── Reading an incoming message ──────────────────────────────────
const toB64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const addrList = list => (list || []).flatMap(a => a.group ? a.group : [a]).map(a => String(a.address || '').toLowerCase()).filter(Boolean);

async function parseRaw(env, row) {
  const obj = row.raw_key ? await env.DOCS.get(row.raw_key) : null;
  if (!obj) return null;
  return PostalMime.parse(await obj.arrayBuffer(), { attachmentEncoding: 'arraybuffer' });
}

/** Parse an incoming message once: cache its readable parts in R2 and update the list row. */
export async function readIncoming(env, row) {
  if (row.parsed_at) return loadParsed(env, row);
  const m = await parseRaw(env, row);
  if (!m) return null;
  let auth = {}; try { auth = JSON.parse(row.auth || '{}'); } catch (e) {}
  const atts = (m.attachments || []).map((a, i) => ({ i, filename: safeName(a.filename || (a.mimeType === 'message/rfc822' ? 'forwarded-message.eml' : `attachment-${i + 1}`)),
    mimeType: String(a.mimeType || 'application/octet-stream').slice(0, 100), size: a.content ? a.content.byteLength : 0,
    cid: a.contentId ? String(a.contentId).replace(/[<>]/g, '') : '', inline: a.disposition === 'inline' && !!a.contentId && /^image\/(png|jpe?g|gif|webp)$/i.test(a.mimeType || ''),
    risk: attachmentRisk(a.filename) }));
  const inlineData = {};
  (m.attachments || []).forEach((a, i) => { const x = atts[i]; if (x.inline && x.size <= INLINE_IMAGE_MAX) inlineData[x.cid] = `data:${x.mimeType};base64,${toB64(a.content)}`; });
  const warnings = securityWarnings({ auth, from: m.from || {}, replyTo: m.replyTo || [], html: m.html || '', text: m.text || '', attachments: atts.filter(a => !a.inline) });
  const text = String(m.text || '').slice(0, 300000) || String(m.html || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').slice(0, 300000);
  const parsed = { html: String(m.html || '').slice(0, 1500000), text, attachments: atts, inlineData, date: m.date || null };
  await env.DOCS.put(parsedKey(row.id), JSON.stringify(parsed), { httpMetadata: { contentType: 'application/json' } });
  const visible = atts.filter(a => !a.inline);
  const fromName = String((m.from && m.from.name) || '').slice(0, 120);
  // Straight to Spam: senders you blocked, and forged or impersonating mail
  const blocked = await blockedSenders(env);
  const fromLc = String(row.from_addr || '').toLowerCase();
  const toSpam = row.folder === 'inbox' && (blocked.includes(fromLc) || blocked.includes('@' + fromLc.split('@')[1]) || warnings.some(w => SPAM_CODES.includes(w.code)));
  if (toSpam) { await env.DB.prepare("UPDATE mail_messages SET folder = 'spam' WHERE id = ?1").bind(row.id).run(); row.folder = 'spam'; }
  await env.DB.prepare(`UPDATE mail_messages SET subject = ?2, from_name = ?3, reply_to = ?4, to_addrs = ?5, cc_addrs = ?6, snippet = ?7, attachments = ?8,
      warnings = ?9, parsed_at = ?10 WHERE id = ?1`).bind(row.id, String(m.subject || row.subject || '').slice(0, 300), fromName,
    ((m.replyTo || [])[0] || {}).address || null, addrList(m.to).join(', ').slice(0, 1000) || row.to_addrs, addrList(m.cc).join(', ').slice(0, 1000),
    text.replace(/\s+/g, ' ').trim().slice(0, 180), visible.length, JSON.stringify(warnings), new Date().toISOString()).run();
  Object.assign(row, { subject: m.subject || row.subject, from_name: fromName, attachments: visible.length, warnings: JSON.stringify(warnings), parsed_at: 'now' });
  return parsed;
}
const parsedKey = id => `mail/parsed/${id}.json`;
async function loadParsed(env, row) {
  const o = await env.DOCS.get(parsedKey(row.id));
  if (o) return o.json();
  return row.direction === 'in' ? readIncoming(env, { ...row, parsed_at: null }) : null;
}
export { loadParsed };

/** One attachment's bytes (incoming: re-read from the original message; outgoing: stored copy). */
export async function attachmentBytes(env, row, i) {
  if (row.direction === 'out') {
    const o = await env.DOCS.get(`mail/out/${row.id}/${i}`);
    return o ? { content: await o.arrayBuffer(), filename: o.customMetadata?.filename || `attachment-${i + 1}`, mimeType: o.httpMetadata?.contentType || 'application/octet-stream' } : null;
  }
  const m = await parseRaw(env, row);
  const a = m && (m.attachments || [])[i];
  return a ? { content: a.content, filename: safeName(a.filename || `attachment-${i + 1}`), mimeType: a.mimeType || 'application/octet-stream' } : null;
}

// ── Showing email HTML safely ────────────────────────────────────
/**
 * Clean email HTML before it goes into the sandboxed frame (the frame's CSP and sandbox are the
 * main protection; this removes active content as a second layer).
 */
export function cleanHtml(html, { inlineData = {}, images = false } = {}) {
  let h = String(html || '');
  h = h.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|iframe|frameset|object|embed|applet|noscript|template|svg|math|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(script|iframe|frame|frameset|object|embed|applet|noscript|template|svg|math|form|input|button|select|option|textarea|base|link|meta|title)\b[^>]*>/gi, '')
    .replace(/\s(on[a-z]+|formaction|srcdoc|action)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|background|poster)\s*=\s*(["']?)\s*(javascript|vbscript|data:text|file):[^"'\s>]*/gi, '$1=$2#')
    .replace(/expression\s*\(|@import|behavior\s*:|-moz-binding/gi, '');
  h = h.replace(/(src|background)\s*=\s*(["'])cid:([^"']+)\2/gi, (all, attr, q, cid) => inlineData[cid] ? `${attr}=${q}${inlineData[cid]}${q}` : `${attr}=${q}#${q}`);
  if (!images) h = h.replace(/(<img\b[^>]*?)\ssrc\s*=\s*(["'])(https?:[^"']*)\2/gi, '$1 src="" data-blocked="1" alt="[image hidden]"')
    .replace(/url\(\s*["']?https?:[^)]*\)/gi, 'none');
  // Every link opens in a new tab, without telling the other site where it came from
  h = h.replace(/<a\b/gi, '<a target="_blank" rel="noopener noreferrer nofollow"');
  return h;
}
export const bodyCsp = images => `default-src 'none'; style-src 'unsafe-inline'; img-src data:${images ? ' https: http:' : ''}; font-src data:; frame-ancestors 'self'; form-action 'none'; base-uri 'none'; sandbox allow-popups allow-popups-to-escape-sandbox`;

export function bodyDocument(parsed, { images = false } = {}) {
  const content = parsed.html
    ? cleanHtml(parsed.html, { inlineData: parsed.inlineData || {}, images })
    : `<pre style="white-space:pre-wrap;word-break:break-word;font:14px/1.55 -apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0">${esc(parsed.text || '').replace(/(https?:\/\/[^\s<>"']+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>')}</pre>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><base target="_blank">
<style>body{margin:0;padding:14px;font:14px/1.55 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1C2733;background:#fff;word-break:break-word}img{max-width:100%;height:auto}table{max-width:100%}img[data-blocked]{display:inline-block;min-width:24px;min-height:12px;background:#EFE9DC}</style></head><body>${content}</body></html>`;
}

// ── Sending ──────────────────────────────────────────────────────
export function composeHtml(body, { signature = '', signatureHtml = '', quote = null } = {}) {
  const para = s => esc(s).replace(/\r?\n/g, '<br>');
  // Quoted lines ("> ...") from a reply are shown as a quote block
  const blocks = String(body || '').split(/\n{2,}/).map(p => /^(>.*(\n|$))+$/.test(p.trim() + '\n')
    ? `<blockquote style="margin:6px 0 12px;padding:0 0 0 12px;border-left:3px solid #E6DECD;color:#455463">${para(p.replace(/^> ?/gm, ''))}</blockquote>`
    : `<p style="margin:0 0 12px">${para(p)}</p>`);
  const quoteAt = blocks.findIndex(b => b.startsWith('<blockquote'));
  const mainParts = quoteAt > 0 ? blocks.slice(0, quoteAt - (/wrote:|Forwarded message/.test(blocks[quoteAt - 1]) ? 1 : 0)) : quoteAt === 0 ? [] : blocks;
  const rest = blocks.slice(mainParts.length).join('');
  const sig = signatureHtml || (signature ? `<p style="margin:16px 0 0;color:#455463">${para(signature)}</p>` : '');
  return `<div style="font:14px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1C2733">${mainParts.join('')}${sig}${rest ? `<div style="margin-top:18px">${rest}</div>` : ''}</div>`;
}
/**
 * Send through Brevo. to/cc: arrays of addresses. attachments: [{ name, content (ArrayBuffer), type }].
 * Returns the Brevo message id (used as the Message-ID, so replies thread back here).
 */
export async function sendViaBrevo(env, { from, to, cc = [], bcc = [], subject, html, text, inReplyTo = null, references = [], attachments = [] }) {
  if (!env.BREVO_API_KEY) throw new Error('Sending is not set up (no Brevo key)');
  const sender = from || mailFrom(env);
  if (!String(sender.email).endsWith('@' + OUR_DOMAIN)) throw new Error('Sender must be on our domain');
  const body = { sender, replyTo: sender, to: to.map(email => ({ email })), subject, htmlContent: html, textContent: text, tags: ['dashboard-mail'] };
  if (bcc.length) body.bcc = bcc.map(email => ({ email }));
  if (cc.length) body.cc = cc.map(email => ({ email }));
  if (attachments.length) body.attachment = attachments.map(a => ({ name: a.name, content: toB64(a.content) }));
  const headers = {};
  if (inReplyTo) { headers['In-Reply-To'] = inReplyTo; headers['References'] = [...references, inReplyTo].filter((v, i, x) => v && x.indexOf(v) === i).slice(-10).join(' '); }
  if (Object.keys(headers).length) body.headers = headers;
  const res = await fetch(`${env.BREVO_API_BASE || 'https://api.brevo.com'}/v3/smtp/email`, {
    method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const out = await res.json().catch(() => ({}));
  return out.messageId || null;
}

/** Parse "a@b.com, Name <c@d.com>; e@f.com" into clean addresses. Returns { list, bad }. */
export function parseRecipients(s) {
  const list = [], bad = [];
  for (const part of String(s || '').split(/[,;\n]+/)) {
    const p = part.trim(); if (!p) continue;
    const m = p.match(/<([^<>]+)>\s*$/); const a = (m ? m[1] : p).trim().toLowerCase();
    if (validEmail(a)) { if (!list.includes(a)) list.push(a); } else bad.push(p.slice(0, 80));
  }
  return { list, bad };
}

/** Empty the trash: messages there longer than TRASH_DAYS are deleted for good, files included. */
export async function purgeTrash(env, now = new Date()) {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * 86400000).toISOString();
  const rows = (await env.DB.prepare("SELECT id, raw_key, direction, attachments FROM mail_messages WHERE folder = 'trash' AND trashed_at < ?1 LIMIT 200").bind(cutoff).all()).results || [];
  for (const r of rows) {
    const keys = [parsedKey(r.id)];
    if (r.raw_key) keys.push(r.raw_key);
    if (r.direction === 'out') for (let i = 0; i < (r.attachments || 0); i++) keys.push(`mail/out/${r.id}/${i}`);
    await env.DOCS.delete(keys);
  }
  if (rows.length) await env.DB.prepare(`DELETE FROM mail_messages WHERE id IN (${rows.map((_, i) => `?${i + 1}`).join(',')})`).bind(...rows.map(r => r.id)).run();
  return rows.length;
}

/** Erase all mail linked to a client (NDPA erasure). */
export async function eraseClientMail(env, clientId) {
  const rows = (await env.DB.prepare('SELECT id, raw_key, direction, attachments FROM mail_messages WHERE client_id = ?1').bind(clientId).all()).results || [];
  for (const r of rows) {
    const keys = [parsedKey(r.id)];
    if (r.raw_key) keys.push(r.raw_key);
    if (r.direction === 'out') for (let i = 0; i < (r.attachments || 0); i++) keys.push(`mail/out/${r.id}/${i}`);
    await env.DOCS.delete(keys);
  }
  await env.DB.prepare('DELETE FROM mail_messages WHERE client_id = ?1').bind(clientId).run();
  return rows.length;
}

// ── Spam and blocked senders ─────────────────────────────────────
export const SPAM_CODES = ['forged', 'lookalike', 'fake_name'];
export async function blockedSenders(env) {
  try { const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'mail_blocked'").first(); return r ? JSON.parse(r.value) : []; } catch (e) { return []; }
}
export async function saveBlocked(env, list) {
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('mail_blocked', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2")
    .bind(JSON.stringify([...new Set(list)].slice(0, 500)), new Date().toISOString()).run();
}

// ── Delivered and read ticks (Brevo events) ──────────────────────
// Brevo reports "delivered" when the recipient's server accepts the email and "opened" when the
// email's pictures load. Opens are a good sign, not proof: some apps load pictures automatically
// (Apple Mail Privacy Protection, reported by Brevo as a "proxy open", which we do not count as read)
// and some people block pictures, so a read email can stay grey.
export const RECEIPT_EVENTS = ['delivered', 'opened', 'unique_opened', 'click'];
export async function mailWebhookSettings(env) {
  const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'brevo_mail_webhook'").first();
  return r ? JSON.parse(r.value) : null;
}
/** Create the Brevo webhook for delivered/opened events once (from the first send, or the daily job). */
export async function ensureMailWebhook(env, origin = `https://${OUR_DOMAIN}`) {
  const existing = await mailWebhookSettings(env);
  if (existing && existing.id) return existing;
  if (!env.BREVO_API_KEY) return null;
  const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch(`${env.BREVO_API_BASE || 'https://api.brevo.com'}/v3/webhooks`, {
    method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ url: `${origin}/hooks/brevo?k=${token}`, description: 'Awal dashboard mail: delivered and read', events: ['delivered', 'opened', 'uniqueOpened', 'click'], type: 'transactional' })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(`Brevo refused the mail webhook (${res.status})`);
  const settings = { id: data.id, token, createdAt: new Date().toISOString() };
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('brevo_mail_webhook', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2")
    .bind(JSON.stringify(settings), settings.createdAt).run();
  return settings;
}
/** Record one Brevo delivered/opened event on the sent email it belongs to. */
export async function handleMailEvent(env, ev) {
  const kind = String(ev.event || '');
  if (!RECEIPT_EVENTS.includes(kind)) return { ignored: true };
  const mid = String(ev['message-id'] || ev.messageId || '').trim();
  const email = String(ev.email || '').trim().toLowerCase();
  if (!mid || !email) return { ignored: true };
  let row;
  try { row = await env.DB.prepare("SELECT id, to_addrs, cc_addrs, receipts, delivered_at, opened_at FROM mail_messages WHERE provider_id = ?1 AND direction = 'out'").bind(mid).first(); } catch (e) { return { ignored: true }; }
  if (!row) return { ignored: true };
  const at = ev.date ? new Date(String(ev.date).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(ev.date) ? '' : '+01:00')).toISOString() : new Date().toISOString();
  const r = JSON.parse(row.receipts || '{}');
  const cur = r[email] || {};
  if (kind === 'delivered') cur.delivered = cur.delivered || at;
  else { cur.delivered = cur.delivered || at; cur.opened = cur.opened || at; }
  r[email] = cur;
  const all = [...String(row.to_addrs).split(','), ...String(row.cc_addrs).split(',')].map(x => x.trim()).filter(Boolean);
  const deliveredAll = all.length && all.every(a => r[a] && r[a].delivered);
  await env.DB.prepare('UPDATE mail_messages SET receipts = ?2, delivered_at = COALESCE(delivered_at, ?3), opened_at = COALESCE(opened_at, ?4) WHERE id = ?1')
    .bind(row.id, JSON.stringify(r), deliveredAll ? at : null, cur.opened || null).run();
  return { updated: row.id };
}
/** sent ✓ · delivered ✓✓ (grey) · read ✓✓ (blue) */
export function receiptState(row) {
  if (row.direction !== 'out' || row.folder === 'drafts') return null;
  if (row.opened_at) return { state: 'read', at: row.opened_at };
  if (row.delivered_at) return { state: 'delivered', at: row.delivered_at };
  return { state: 'sent', at: row.received_at };
}
