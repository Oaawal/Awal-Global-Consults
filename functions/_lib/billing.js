/**
 * Quotations, invoices, receipts and engagement letters.
 *
 * Numbers follow the firm's templates: AGC-QT-2026-Nov-01, AGC-INV-…, AGC-RCT-…, AGC-EL-…
 * (a running number per document type per month). Amounts are whole naira.
 *
 * VAT: only added when the firm's VAT setting is on (turn it on once VAT is active on the
 * NRS profile). It applies to the firm's own fee lines, never to government fees paid on
 * the client's behalf. When VAT is off, the document is titled "Invoice", not "Tax Invoice".
 *
 * Documents are rendered as print-ready HTML pages (A4), viewable by the client through a
 * private signed link and saved as PDF from the browser.
 */

import { LOGO, SIGNATURE, SEAL } from './brand-assets.js';

export const VAT_RATE = 7.5;
const SITE_URL = 'https://awalglobal.com.ng';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PREFIX = { quote: 'QT', invoice: 'INV', receipt: 'RCT', engagement: 'EL' };
export const KIND_LABEL = { quote: 'Quotation', invoice: 'Invoice', receipt: 'Receipt', engagement: 'Engagement letter' };

// Starting prices used to pre-fill a new quotation (edit them before sending)
export const START_PRICES = {
  'Business Name Registration': 40000, 'Limited Company Registration': 75000, 'Incorporated Trustees / NGO': 150000,
  'SCUML Registration': 70000, 'GRC Review': 250000, 'Legal Advisory': 20000
};
export const PAYMENT_DETAILS = 'Bank Transfer — Kuda Bank. Account Name: Awal Global Consults Limited. Account Number: 3003466189. Card/Online: paystack.shop/pay/awalglobal';
export const PAYMENT_METHODS = ['Bank transfer', 'Paystack (card/online)', 'Cash', 'Other'];

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');
const plain = n => Math.round(Number(n) || 0).toLocaleString('en-NG');
const dayLong = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
const dayShort = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
export const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * 86400000).toISOString();

// ── Settings ─────────────────────────────────────────────────────
export async function billingSettings(env) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'billing'").first();
  return { vatRegistered: false, ...(row ? JSON.parse(row.value) : {}) };
}
export async function saveBillingSettings(env, s) {
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('billing', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2")
    .bind(JSON.stringify(s), new Date().toISOString()).run();
}

// ── Numbers ──────────────────────────────────────────────────────
export async function nextNumber(env, kind, iso = new Date().toISOString()) {
  const d = new Date(new Date(iso).getTime() + 3600000); // Lagos time
  const name = `AGC-${PREFIX[kind]}-${d.getUTCFullYear()}-${MONTHS[d.getUTCMonth()]}`;
  const row = await env.DB.prepare('INSERT INTO counters (name, value) VALUES (?1, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value').bind(name).first();
  return `${name}-${String(row.value).padStart(2, '0')}`;
}

// ── Totals ───────────────────────────────────────────────────────
/** items: [{ description, detail, qty, unit, gov }] — gov = government fee (no VAT). */
export function totals(items, vatOn) {
  const clean = items.map(i => ({
    description: String(i.description || '').trim().slice(0, 200), detail: String(i.detail || '').trim().slice(0, 300),
    qty: Math.max(1, Math.min(999, parseInt(i.qty, 10) || 1)), unit: Math.max(0, Math.round(Number(String(i.unit || '0').replace(/[^\d.]/g, '')) || 0)),
    gov: !!i.gov, timeline: String(i.timeline || '').trim().slice(0, 60)
  })).filter(i => i.description);
  clean.forEach(i => { i.amount = i.qty * i.unit; });
  const subtotal = clean.reduce((t, i) => t + i.amount, 0);
  const vatable = clean.filter(i => !i.gov).reduce((t, i) => t + i.amount, 0);
  const vat = vatOn ? Math.round(vatable * VAT_RATE / 100) : 0;
  return { items: clean, subtotal, vat, total: subtotal + vat, vatRate: vatOn ? VAT_RATE : 0 };
}

// ── Amount in words (Nigerian style: "Eighty-Six Thousand Naira Only") ──
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : '');
  return [h ? `${ONES[h]} Hundred` : '', rest ? (h ? 'and ' : '') + rest : ''].filter(Boolean).join(' ');
}
export function nairaWords(amount) {
  let n = Math.round(Number(amount) || 0);
  if (n === 0) return 'Zero Naira Only';
  const parts = [];
  for (const [size, name] of [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand'], [1, '']]) {
    const chunk = Math.floor(n / size); n %= size;
    if (chunk) parts.push({ chunk, text: under1000(chunk) + (name ? ' ' + name : '') });
  }
  let out = parts[0].text;
  for (let i = 1; i < parts.length; i++) {
    const last = i === parts.length - 1 && parts[i].chunk < 100;
    out += (last ? ' and ' : ', ') + parts[i].text;
  }
  return out + ' Naira Only';
}

// ── Private links for clients ────────────────────────────────────
const enc = new TextEncoder();
async function linkSecret(env) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'upload_secret'").first();
  if (row) return row.value;
  const v = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/[+/=]/g, '');
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('upload_secret', ?1, ?2) ON CONFLICT(key) DO NOTHING").bind(v, new Date().toISOString()).run();
  return (await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'upload_secret'").first()).value;
}
async function sign(env, id) {
  const key = await crypto.subtle.importKey('raw', enc.encode(await linkSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`billing:${id}`)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}
export async function docUrl(env, id, origin = SITE_URL) { return `${origin}/billing/${id}/${await sign(env, id)}`; }
export async function verifyDocLink(env, id, s) {
  if (!/^[0-9a-f-]{36}$/.test(id || '') || !s) return false;
  const want = await sign(env, id);
  if (want.length !== s.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ s.charCodeAt(i);
  return d === 0;
}

// ── Rendering ────────────────────────────────────────────────────
const CSS = `
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; background: #e9edf2; font-family: 'DM Sans', Arial, sans-serif; color: #1f2937; font-size: 10.5pt; }
.sheet { background: #fff; max-width: 210mm; margin: 18px auto; padding: 16mm 15mm 12mm; box-shadow: 0 6px 24px rgba(13,35,64,.12); }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
.top img { height: 64px; }
.addr { text-align: right; font-family: 'Fraunces', Georgia, serif; font-weight: 600; color: #0D2340; font-size: 10pt; line-height: 1.35; }
.addr .rc { font-family: 'DM Sans', Arial; color: #93701F; font-weight: 700; letter-spacing: .04em; margin-bottom: 4px; }
.addr .web { font-family: 'DM Sans', Arial; font-weight: 400; color: #93701F; font-size: 8.5pt; }
.kicker { color: #93701F; font-size: 8pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; margin-top: 18px; }
h1 { font-family: 'Fraunces', Georgia, serif; color: #0D2340; font-size: 30pt; margin: 2px 0 2px; font-weight: 600; }
.badge { color: #93701F; font-size: 8pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0 18px; }
.meta div span, .parties span, .boxes span { display: block; color: #93701F; font-size: 7.5pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 3px; }
.meta div strong { color: #0D2340; font-size: 11pt; }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 18px; }
.parties strong { color: #0D2340; font-size: 12pt; display: block; }
.parties div div { color: #4A5568; line-height: 1.5; }
table { width: 100%; border-collapse: collapse; margin-top: 6px; }
th { background: #0D2340; color: #fff; font-size: 7.5pt; letter-spacing: .06em; text-transform: uppercase; text-align: left; padding: 8px 8px; }
td { padding: 9px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
td small { display: block; color: #6b7280; font-size: 8pt; margin-top: 2px; }
.num { text-align: right; white-space: nowrap; }
.sum { width: 46%; margin: 14px 0 0 auto; }
.sum td { border-bottom: 1px solid #e5e7eb; }
.sum .total td { font-family: 'Fraunces', Georgia, serif; font-size: 14pt; font-weight: 600; color: #0D2340; border-bottom: 2px solid #0D2340; }
.words { margin: 14px 0; font-style: italic; color: #4A5568; } .words strong { font-style: normal; color: #0D2340; }
.boxes { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 16px 0; }
.boxes > div { background: #EFE7D3; border-top: 3px solid #93701F; padding: 12px 14px; line-height: 1.55; font-size: 9.5pt; }
.letter p { line-height: 1.6; margin: 0 0 10px; } .letter h3 { font-size: 10.5pt; color: #0D2340; margin: 14px 0 4px; }
.sign { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 26px; align-items: end; }
.sign .who { position: relative; min-height: 96px; }
.sign .who img.sig { height: 60px; } .sign .who img.seal { height: 86px; position: absolute; left: 120px; top: -14px; opacity: .9; }
.sign strong { display: block; color: #0D2340; border-top: 1px solid #0D2340; padding-top: 6px; margin-top: 4px; }
.sign small { color: #4A5568; } .sign .client { border-top: 1px solid #9ca3af; padding-top: 6px; color: #4A5568; font-size: 9pt; }
.foot { margin-top: 24px; border-top: 1px solid #d1d5db; padding-top: 8px; font-size: 7.2pt; color: #4A5568; line-height: 1.5; }
.foot b { color: #0D2340; }
.void { color: #b42318; border: 2px solid #b42318; display: inline-block; padding: 2px 10px; font-weight: 700; letter-spacing: .1em; margin-left: 10px; }
.bar { max-width: 210mm; margin: 18px auto 0; display: flex; gap: 10px; justify-content: flex-end; }
.bar button { background: #0D2340; color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; font: 600 10pt 'DM Sans', Arial; cursor: pointer; }
@media print { body { background: #fff; } .sheet { box-shadow: none; margin: 0; max-width: none; padding: 0; } .bar { display: none; } }
@media (max-width: 640px) { .sheet { padding: 18px 14px; margin: 0; } .meta, .parties, .boxes, .sign { grid-template-columns: 1fr; } .sum { width: 100%; } h1 { font-size: 24pt; } .top { flex-direction: column; } .addr { text-align: left; } }
`;

const HEAD_ADDR = `<div class="addr"><div class="rc">RC-9282103</div>12, Hakeem Balogun Street<br>Central Business District (CBD)<br>Agidingbi, Alausa, Ikeja<br>Lagos, Nigeria.<div class="web">awalglobal.com.ng</div></div>`;
const FOOTER = `<div class="foot"><b>Awal Global Consults Limited</b> · RC-9282103 · Registered Office: 12 Hakeem Balogun Street, Agidingbi, Ikeja, Lagos State, Nigeria<br>
+234 703 833 6596 · info@awalglobal.com.ng · awalglobal.com.ng<br>
Directors: A.O. Abdulwaheed · A.B. Jimoh · I.A. Adeleke · Former name(s): None · Nationality of non-Nigerian director(s): N/A, all directors Nigerian<br>
TIN: 2622489142694 (unified NRS Tax ID)<br>Disclosed pursuant to Sections 304(1) &amp; (2) and 729(1)(c) of the Companies and Allied Matters Act 2020</div>`;
const SIGNOFF = (clientLabel) => `<div class="sign"><div class="who"><img class="sig" src="${SIGNATURE}" alt=""><img class="seal" src="${SEAL}" alt=""><strong>A.O. Abdulwaheed</strong><small>For: Awal Global Consults Limited — Director</small></div>
  <div class="client">${esc(clientLabel)}</div></div>`;

function clientBlock(cl, title) {
  return `<div><span>${esc(title)}</span><strong>${esc(cl.name)}</strong><div>${[cl.address, cl.phone, cl.email].filter(Boolean).map(esc).join('<br>')}</div></div>`;
}

export function renderDoc(doc, { related = null, invoice = null, receipt = null, quote = null } = {}) {
  const cl = JSON.parse(doc.client_json || '{}');
  const items = JSON.parse(doc.items_json || '[]');
  const voided = doc.status === 'void' ? '<span class="void">VOID</span>' : '';
  let title = KIND_LABEL[doc.kind], kicker = '', badge = '', body = '';

  if (doc.kind === 'quote') {
    kicker = 'Official price quotation'; badge = 'Valid 14 days';
    body = `<div class="meta"><div><span>Quote No.</span><strong>${esc(doc.number)}</strong></div><div><span>Date issued</span><strong>${dayShort(doc.issued_at)}</strong></div><div><span>Valid until</span><strong>${dayShort(doc.valid_until)}</strong></div></div>
      <div class="parties">${clientBlock(cl, 'Prepared for')}<div><span>Service category</span><strong>${esc(doc.category || '')}</strong></div></div>
      <table><thead><tr><th>Service</th><th>What's included</th><th>Timeline</th><th class="num">Amount (₦)</th></tr></thead><tbody>
      ${items.map(i => `<tr><td><strong>${esc(i.description)}</strong>${i.qty > 1 ? `<small>Qty ${i.qty} × ${plain(i.unit)}</small>` : ''}${i.gov ? '<small>Government fee (no VAT)</small>' : ''}</td><td>${esc(i.detail)}</td><td>${esc(i.timeline || '')}</td><td class="num">${i.amount ? plain(i.amount) : '[Custom quote]'}</td></tr>`).join('')}
      </tbody></table>${sumTable(doc, 'Estimated Total')}
      <div class="boxes"><div><span>What's included</span>Our professional service charge, all government fees listed above, and digital delivery of documents. No hidden charges.</div>
      <div><span>Terms &amp; validity</span>This quotation is valid for 14 days from the date of issue. Prices may be revised after expiry or if scope changes. A formal invoice will be issued to confirm engagement and begin work.</div></div>
      ${doc.notes ? `<p>${esc(doc.notes)}</p>` : ''}${SIGNOFF('Client Confirmation (accept & return to proceed)')}`;
  }

  if (doc.kind === 'invoice') {
    title = doc.vat_rate > 0 ? 'Tax Invoice' : 'Invoice';
    kicker = doc.vat_rate > 0 ? 'Tax invoice' : 'Invoice';
    badge = doc.status === 'paid' ? 'Paid' : doc.status === 'part_paid' ? 'Part paid' : 'Payment due';
    body = `<div class="meta"><div><span>Invoice No.</span><strong>${esc(doc.number)}</strong></div><div><span>Date issued</span><strong>${dayShort(doc.issued_at)}</strong></div><div><span>Due date</span><strong>${dayShort(doc.due_at)}</strong></div></div>
      <div class="parties">${clientBlock(cl, 'Billed to')}<div><span>Client tax details</span><div>Client TIN: ${esc(cl.tin || 'Not provided')}${quote ? `<br>Quotation: ${esc(quote.number)}` : ''}</div></div></div>
      <table><thead><tr><th>S/N</th><th>Description of service</th><th class="num">Qty</th><th class="num">Unit price (₦)</th><th class="num">Amount (₦)</th></tr></thead><tbody>
      ${items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.description)}${i.detail ? `<small>${esc(i.detail)}</small>` : ''}${i.gov ? '<small>Government fee paid on your behalf (no VAT)</small>' : ''}</td><td class="num">${i.qty}</td><td class="num">${plain(i.unit)}</td><td class="num">${plain(i.amount)}</td></tr>`).join('')}
      </tbody></table>${sumTable(doc, 'Total Due')}
      <div class="words">Amount in words: <strong>${esc(nairaWords(doc.total))}</strong></div>
      <div class="boxes"><div><span>Payment details</span>${esc(PAYMENT_DETAILS)}</div>
      <div><span>Terms</span>Payment is due on or before the date above. Work commences and documents are released upon confirmation of payment. This invoice covers the services listed only; any additional government fees arising from changes to your request will be communicated before proceeding.</div></div>
      ${doc.notes ? `<p>${esc(doc.notes)}</p>` : ''}${SIGNOFF('Client Acknowledgement (optional)')}`;
  }

  if (doc.kind === 'receipt') {
    kicker = 'Official receipt'; badge = 'Paid';
    const inv = invoice || {};
    const stored = /^balance:(\d+)$/.exec(doc.notes || '');
    const balance = stored ? Number(stored[1]) : Math.max(0, (inv.total || doc.total) - (doc.amount_paid || 0));
    body = `<div class="meta"><div><span>Receipt No.</span><strong>${esc(doc.number)}</strong></div><div><span>Date</span><strong>${dayShort(doc.paid_at || doc.issued_at)}</strong></div><div><span>Against invoice No.</span><strong>${esc(inv.number || '')}</strong></div></div>
      <div class="parties">${clientBlock(cl, 'Received from')}<div><span>Payment for</span><div>${esc(items.map(i => i.description).join(', '))}</div></div></div>
      <table><thead><tr><th>Description</th><th class="num">Invoice amount (₦)</th><th class="num">Amount paid (₦)</th><th class="num">Balance (₦)</th></tr></thead><tbody>
      <tr><td>${esc(items.map(i => i.description).join(' + '))}</td><td class="num">${plain(inv.total || doc.total)}</td><td class="num">${plain(doc.amount_paid)}</td><td class="num">${plain(balance)}</td></tr></tbody></table>
      <div class="words">Amount received: <strong>${money(doc.amount_paid)} (${esc(nairaWords(doc.amount_paid))})</strong></div>
      <div class="boxes"><div><span>Payment method</span>${esc(doc.payment_method || '')}${doc.payment_ref ? `. Transaction reference: ${esc(doc.payment_ref)}` : ''}</div>
      <div><span>Note</span>This receipt confirms payment received and is not a tax invoice. Please keep it with your invoice (number above) for your records.</div></div>
      ${SIGNOFF('Client Signature (optional)')}`;
  }

  if (doc.kind === 'engagement') {
    kicker = 'Confirmation of engagement'; title = 'Engagement Letter';
    const inv = invoice || {}, rc = receipt || {}, qt = quote || {};
    const service = doc.category || items.map(i => i.description).join(', ');
    body = `<div class="letter"><p>Ref: <strong>${esc(doc.number)}</strong><br>Date: ${dayLong(doc.issued_at)}</p>
      <p><strong>${esc(cl.name)}</strong>${cl.address ? `<br>${esc(cl.address)}` : ''}</p>
      <p>Dear ${esc(cl.salutation || cl.name)},</p>
      <p><strong>RE: CONFIRMATION OF ENGAGEMENT FOR ${esc(service.toUpperCase())}</strong></p>
      <p>Thank you for your payment. We confirm receipt against Invoice No. ${esc(inv.number || '')} and Receipt No. ${esc(rc.number || '')} and are pleased to formally confirm our engagement on the following terms.</p>
      <h3>1. Scope of Engagement</h3><p>Awal Global Consults Limited ("the Firm") shall provide ${esc(doc.notes || service)} on behalf of ${esc(cl.name)} ("the Client")${qt.number ? `, as more particularly described in Quotation No. ${esc(qt.number)}` : ''}.</p>
      <h3>2. Fees</h3><p>The total fee for this engagement is ${money(inv.total || doc.total)} (${esc(nairaWords(inv.total || doc.total))}), inclusive of applicable government charges${(inv.vat_rate || 0) > 0 ? ' and VAT' : ''}, as invoiced under ${esc(inv.number || '')} and confirmed paid under Receipt No. ${esc(rc.number || '')}. Any variation to scope requested by the Client after this date may attract additional fees, which will be communicated and agreed on before proceeding.</p>
      <h3>3. Client Responsibilities</h3><p>The Client agrees to promptly provide accurate information and documentation reasonably required by the Firm to perform the services. Delays in providing such information may affect delivery timelines quoted.</p>
      <h3>4. Timelines</h3><p>Estimated timelines communicated by the Firm are based on standard processing periods at the relevant regulatory bodies (including CAC and NRS) and are indicative only; the Firm does not control, and cannot guarantee, third-party regulatory processing times.</p>
      <h3>5. Confidentiality</h3><p>Each party shall keep confidential all non-public information received from the other in connection with this engagement and shall not disclose it to any third party except as required to perform the services or by law.</p>
      <h3>6. Limitation of Liability</h3><p>The Firm shall perform the services with reasonable skill and care. The Firm's liability in connection with this engagement shall not exceed the total fees paid by the Client for the specific service giving rise to the claim.</p>
      <h3>7. Termination</h3><p>Either party may terminate this engagement on written notice where the other party is in material breach of these terms. Fees for work already performed up to the date of termination remain payable.</p>
      <h3>8. Governing Law</h3><p>This engagement is governed by the laws of the Federal Republic of Nigeria.</p>
      <p>Please sign and return a copy of this letter to confirm your acceptance of these terms.</p><p>Yours sincerely,<br><strong>FOR: AWAL GLOBAL CONSULTS LIMITED</strong></p></div>
      ${SIGNOFF('Client Acceptance — Signature & Date')}`;
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(KIND_LABEL[doc.kind])} ${esc(doc.number)} · Awal Global Consults</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="bar"><button type="button" onclick="window.print()">Download / Print PDF</button></div>
<div class="sheet">
  <div class="top"><img src="${LOGO}" alt="Awal Global Consults">${HEAD_ADDR}</div>
  <div class="kicker">${esc(kicker)}</div><h1>${esc(title)}${voided}</h1>${badge ? `<div class="badge">${esc(badge)}</div>` : ''}
  ${body}
  ${FOOTER}
</div></body></html>`;
}

function sumTable(doc, totalLabel) {
  return `<table class="sum"><tbody><tr><td>Subtotal</td><td class="num">${money(doc.subtotal)}</td></tr>
    ${doc.vat_rate > 0 ? `<tr><td>VAT (${doc.vat_rate}% on our fees)</td><td class="num">${money(doc.vat_amount)}</td></tr>` : ''}
    <tr class="total"><td>${esc(totalLabel)}</td><td class="num">${money(doc.total)}</td></tr></tbody></table>`;
}
