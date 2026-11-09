/**
 * PDF copies of quotations, invoices, receipts and engagement letters, attached to the
 * billing emails. Same content and look as renderDoc() in billing.js (the web view).
 *
 * Built to stay within Cloudflare's per-request CPU budget (a PDF takes ~5ms): pdf-lib is
 * loaded on first use only, the fonts are the PDF standard ones (Helvetica, close to DM Sans;
 * Times Bold for headings, close to Fraunces) so nothing is parsed or embedded, and images
 * are JPEG so they embed without decoding. The standard fonts have no naira sign, so ₦ is
 * drawn as an N with two bars.
 */
import { KIND_LABEL, PAYMENT_DETAILS, money, nairaWords, feesSentence } from './billing.js';
import * as A from './pdf-assets.js';

const NAVY = [13, 35, 64], CREAM = [239, 231, 211], GOLD = [147, 112, 31], GREY = [74, 85, 104], LINE = [226, 232, 240], RED = [185, 28, 28];
const W = 595.28, H = 841.89, M = 48, TOP = 40, BOTTOM = 26, CW = W - 2 * M, FOOT_H = 60;

const plain = n => Math.round(Number(n) || 0).toLocaleString('en-NG');
const dayLong = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }) : '';
const dayShort = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }) : '';
const BYTES = new Map(); // decoded once per worker, reused across requests
const b64 = s => {
  let out = BYTES.get(s);
  if (!out) { const bin = atob(s); out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); BYTES.set(s, out); }
  return out;
};

let libs;
const load = async () => libs || (libs = await import('./vendor/pdf-lib.js'));

export function pdfFilename(doc) {
  return `${(KIND_LABEL[doc.kind] || 'Document').replace(/\s+/g, '-')}-${doc.number}.pdf`;
}

/** @returns {Promise<Uint8Array>} */
export async function renderPdf(doc, { invoice = null, receipt = null, quote = null } = {}) {
  const L = await load();
  const pdf = await L.PDFDocument.create();
  const kindLabel = doc.kind === 'invoice' && doc.vat_rate > 0 ? 'Tax Invoice' : KIND_LABEL[doc.kind];
  pdf.setTitle(`${kindLabel} ${doc.number}`);
  pdf.setAuthor('Awal Global Consults Limited');
  pdf.setCreator('awalglobal.com.ng');
  pdf.setProducer('Awal Global Consults');
  const F = {
    r: await pdf.embedFont(L.StandardFonts.Helvetica),
    b: await pdf.embedFont(L.StandardFonts.HelveticaBold),
    h: await pdf.embedFont(L.StandardFonts.TimesRomanBold)
  };
  const IMG = {
    logo: await pdf.embedJpg(b64(A.LOGO_JPG)),
    sig: await pdf.embedJpg(b64(A.SIGNATURE_JPG)),
    seal: await pdf.embedJpg(b64(A.SEAL_JPG))
  };
  const rgb = c => L.rgb(c[0] / 255, c[1] / 255, c[2] / 255);

  // Characters a client typed that the fonts can't draw (e.g. Yoruba ọ, ẹ, ṣ): use the base letter, else '?'
  const have = new Map();
  const safe = (font, s) => {
    if (!have.has(font)) have.set(font, new Set(font.getCharacterSet()));
    const set = have.get(font);
    let out = '';
    for (const ch of String(s == null ? '' : s).replace(/[\r\t]/g, ' ')) {
      const cp = ch.codePointAt(0);
      if (set.has(cp) || ch === '\n' || ch === '₦') { out += ch; continue; }
      if (/\p{M}/u.test(ch)) continue; // a lone accent mark (as in ọ́): drop it
      const base = ch.normalize('NFD').replace(/\p{M}/gu, '');
      out += base && [...base].every(c => set.has(c.codePointAt(0))) ? base : ''; // emoji etc.: drop
    }
    return out;
  };
  const meas = (font, s, size) => font.widthOfTextAtSize(s.replace(/₦/g, 'N'), size);
  /** Draw already-safe text; ₦ becomes N with two bars; spacing = extra space between letters. */
  const put = (s, x, yy, font, size, color, spacing = 0) => {
    const c = rgb(color);
    for (const ch of s.split(/(₦)/)) {
      if (!ch) continue;
      if (ch === '₦') {
        const w = font.widthOfTextAtSize('N', size), cap = size * 0.72, th = Math.max(0.5, size * 0.065);
        page.drawText('N', { x, y: yy, font, size, color: c });
        for (const f of [0.36, 0.6]) page.drawRectangle({ x: x - w * 0.06, y: yy + cap * f - th / 2, width: w * 1.12, height: th, color: c });
        x += w + spacing;
      } else {
        if (spacing) page.pushOperators(L.pushGraphicsState(), L.setCharacterSpacing(spacing));
        page.drawText(ch, { x, y: yy, font, size, color: c });
        if (spacing) page.pushOperators(L.popGraphicsState());
        x += font.widthOfTextAtSize(ch, size) + spacing * [...ch].length;
      }
    }
  };

  // ---- pages and cursor ----
  let page, y;
  const pages = [];
  const newPage = () => {
    page = pdf.addPage([W, H]); pages.push(page); y = H - TOP;
  };
  const ensure = h => { if (y - h < BOTTOM + FOOT_H) newPage(); };
  newPage();

  const text = (t, x, yy, { font = F.r, size = 9.5, color = GREY, align = 'left', spacing = 0 } = {}) => {
    const s = safe(font, t);
    const w = meas(font, s, size) + spacing * Math.max(0, [...s].length - 1);
    const xx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    put(s, xx, yy, font, size, color, spacing);
    return w;
  };
  const caps = (t, x, yy, opts = {}) => text(String(t).toUpperCase(), x, yy, { font: F.b, size: 6.8, color: GOLD, spacing: 0.9, ...opts });
  const hline = (x1, x2, yy, color = LINE, thickness = 0.8) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color: rgb(color) });

  /** Wrap rich text: runs = [{t, font}], returns lines of runs. */
  const wrapRuns = (runs, size, maxW) => {
    const words = [];
    for (const r of runs) {
      const parts = safe(r.font, r.t).split(/(\n| +)/);
      for (const p of parts) if (p !== '') words.push({ t: p, font: r.font });
    }
    const lines = []; let cur = [], curW = 0;
    const push = () => { while (cur.length && /^ +$/.test(cur[cur.length - 1].t)) { curW -= cur[cur.length - 1].w; cur.pop(); } lines.push(cur); cur = []; curW = 0; };
    for (const wd of words) {
      if (wd.t === '\n') { push(); continue; }
      const w = meas(wd.font, wd.t, size);
      if (/^ +$/.test(wd.t)) { if (cur.length) { cur.push({ ...wd, w }); curW += w; } continue; }
      if (curW + w > maxW && cur.length) push();
      if (w > maxW) { // a single very long word (an email, a URL): break by characters
        let chunk = '';
        for (const ch of wd.t) {
          if (meas(wd.font, chunk + ch, size) + curW > maxW && (chunk || cur.length)) { if (chunk) { cur.push({ t: chunk, font: wd.font, w: meas(wd.font, chunk, size) }); } push(); chunk = ''; }
          chunk += ch;
        }
        if (chunk) { const cw = meas(wd.font, chunk, size); cur.push({ t: chunk, font: wd.font, w: cw }); curW += cw; }
        continue;
      }
      cur.push({ ...wd, w }); curW += w;
    }
    if (cur.length) push();
    return lines;
  };
  const drawLine = (line, x, yy, size, color, align = 'left', boxW = 0) => {
    const lw = line.reduce((a, r) => a + r.w, 0);
    let xx = align === 'right' ? x + boxW - lw : x;
    const segs = [];
    for (const r of line) { const last = segs[segs.length - 1]; if (last && last.font === r.font) last.t += r.t; else segs.push({ t: r.t, font: r.font }); }
    for (const sg of segs) { put(sg.t, xx, yy, sg.font, size, color); xx += meas(sg.font, sg.t, size); }
  };
  /** A flowing paragraph that can break across pages. */
  const para = (runs, { size = 9.5, color = GREY, lead = 1.5, after = 7, x = M, w = CW } = {}) => {
    const lines = wrapRuns(Array.isArray(runs) ? runs : [{ t: runs, font: F.r }], size, w);
    for (const ln of lines) { ensure(size * lead); y -= size * lead; drawLine(ln, x, y + size * 0.3, size, color); }
    y -= after;
  };
  const block = (runs, size, w) => wrapRuns(Array.isArray(runs) ? runs : [{ t: runs, font: F.r }], size, w);

  // ---- header ----
  const logoW = 128, logoH = logoW * IMG.logo.height / IMG.logo.width;
  page.drawImage(IMG.logo, { x: M, y: y - logoH, width: logoW, height: logoH });
  let ay = y - 9;
  text('RC-9282103', W - M, ay, { font: F.b, size: 9.5, color: GOLD, align: 'right' }); ay -= 15;
  for (const l of ['12, Hakeem Balogun Street', 'Central Business District (CBD)', 'Agidingbi, Alausa, Ikeja', 'Lagos, Nigeria.']) { text(l, W - M, ay, { font: F.h, size: 10, color: NAVY, align: 'right' }); ay -= 13.5; }
  text('awalglobal.com.ng', W - M, ay + 1, { size: 8, color: GOLD, align: 'right' });
  y = Math.min(y - logoH, ay) - 18;

  // ---- title ----
  const items = JSON.parse(doc.items_json || '[]');
  const cl = JSON.parse(doc.client_json || '{}');
  const KICKER = { quote: 'Official price quotation', invoice: doc.vat_rate > 0 ? 'Tax invoice' : 'Invoice', receipt: 'Official receipt', engagement: 'Confirmation of engagement' };
  const TITLE = { quote: 'Quotation', invoice: kindLabel, receipt: 'Receipt', engagement: 'Engagement Letter' };
  caps(KICKER[doc.kind], M, y); y -= 27;
  const tw = text(TITLE[doc.kind], M, y, { font: F.h, size: 26, color: NAVY });
  if (doc.status === 'void') {
    const vx = M + tw + 14;
    page.drawRectangle({ x: vx, y: y + 2, width: 50, height: 20, borderColor: rgb(RED), borderWidth: 1.5 });
    text('VOID', vx + 25, y + 7.5, { font: F.b, size: 11, color: RED, align: 'center', spacing: 1.5 });
  }
  const badge = doc.kind === 'quote' ? 'Valid 14 days' : doc.kind === 'invoice' ? (doc.status === 'paid' ? 'Paid' : doc.status === 'part_paid' ? 'Part paid' : 'Payment due') : doc.kind === 'receipt' ? 'Paid' : '';
  y -= 14;
  if (badge) { caps(badge, M, y); y -= 8; }
  y -= 10;

  // ---- building blocks shared by quote/invoice/receipt ----
  const meta = cells => {
    const cw = CW / cells.length;
    cells.forEach(([label, value], i) => { caps(label, M + i * cw, y); text(value || '', M + i * cw, y - 15, { font: F.b, size: 10.5, color: NAVY }); });
    y -= 34;
  };
  const parties = (left, right) => {
    const colW = CW / 2 - 12;
    const col = (x, { label, name, lines }) => {
      let yy = y; caps(label, x, yy); yy -= 15;
      if (name) { for (const ln of block([{ t: name, font: F.b }], 11, colW)) { drawLine(ln, x, yy, 11, NAVY); yy -= 15; } }
      for (const l of lines.filter(Boolean)) for (const ln of block(l, 9.5, colW)) { drawLine(ln, x, yy, 9.5, GREY); yy -= 13.5; }
      return yy;
    };
    y = Math.min(col(M, left), col(M + CW / 2 + 12, right)) - 8;
  };
  /** cols: [{label, w (fraction), align}], rows: [[{main, subs:[]}|string ...]] */
  const table = (cols, rows) => {
    const xs = []; let acc = M;
    for (const c of cols) { xs.push(acc); acc += c.w * CW; }
    const pad = 7;
    const header = () => {
      page.drawRectangle({ x: M, y: y - 20, width: CW, height: 20, color: rgb(NAVY) });
      cols.forEach((c, i) => {
        const cx = c.align === 'right' ? xs[i] + c.w * CW - pad : xs[i] + pad;
        text(c.label.toUpperCase(), cx, y - 13, { font: F.b, size: 6.6, color: [255, 255, 255], align: c.align === 'right' ? 'right' : 'left', spacing: 0.6 });
      });
      y -= 20;
    };
    ensure(60); header();
    for (const row of rows) {
      const cells = row.map((cell, i) => {
        const c = typeof cell === 'object' && cell !== null ? cell : { main: String(cell ?? '') };
        const cw = cols[i].w * CW - 2 * pad;
        return { main: block([{ t: c.main, font: c.bold ? F.b : F.r }], 9.5, cw), subs: (c.subs || []).filter(Boolean).flatMap(s => block(s, 7.5, cw)) };
      });
      const h = Math.max(...cells.map(c => c.main.length * 13 + c.subs.length * 10.5)) + 11;
      if (y - h < BOTTOM + FOOT_H) { newPage(); header(); }
      cells.forEach((c, i) => {
        let yy = y - 14; const align = cols[i].align === 'right' ? 'right' : 'left'; const bw = cols[i].w * CW - 2 * pad;
        for (const ln of c.main) { drawLine(ln, xs[i] + pad, yy, 9.5, NAVY, align, bw); yy -= 13; }
        yy += 2;
        for (const ln of c.subs) { drawLine(ln, xs[i] + pad, yy, 7.5, GREY, align, bw); yy -= 10.5; }
      });
      y -= h; hline(M, M + CW, y);
    }
    y -= 8;
  };
  const sums = totalLabel => {
    const rows = [['Subtotal', money(doc.subtotal)]];
    if (doc.vat_rate > 0) rows.push([`VAT (${doc.vat_rate}% on our fees)`, money(doc.vat_amount)]);
    ensure(rows.length * 24 + 34);
    const x0 = M + CW - 230, x1 = M + CW;
    for (const [l, v] of rows) { text(l, x0 + 6, y - 13, { size: 9.5 }); text(v, x1 - 6, y - 13, { size: 9.5, color: NAVY, align: 'right' }); y -= 20; hline(x0, x1, y); }
    text(totalLabel, x0 + 6, y - 17, { font: F.h, size: 12.5, color: NAVY });
    text(money(doc.total), x1 - 6, y - 17, { font: F.h, size: 13.5, color: NAVY, align: 'right' });
    y -= 25; hline(x0, x1, y, NAVY, 1.6); y -= 9;
  };
  const words = (label, value) => { para([{ t: label + ' ', font: F.r }, { t: value, font: F.b }], { size: 9.5, color: NAVY, after: 5 }); };
  const boxes = (a, b) => {
    const bw = CW / 2 - 7, pad = 11;
    const la = block(a[1], 8.6, bw - 2 * pad), lb = block(b[1], 8.6, bw - 2 * pad);
    const h = 2 * pad + 12 + Math.max(la.length, lb.length) * 12;
    ensure(h + 10);
    [[a, la, M], [b, lb, M + bw + 14]].forEach(([[label], lines, x]) => {
      page.drawRectangle({ x, y: y - h, width: bw, height: h, color: rgb(CREAM) });
      page.drawRectangle({ x, y: y - 2.2, width: bw, height: 2.2, color: rgb(GOLD) });
      caps(label, x + pad, y - pad - 6);
      let yy = y - pad - 20;
      for (const ln of lines) { drawLine(ln, x + pad, yy, 8.6, GREY); yy -= 12; }
    });
    y -= h + 10;
  };
  const signoff = clientLabel => {
    ensure(94);
    const sigH = 42, sigW = sigH * IMG.sig.width / IMG.sig.height, sealH = 56, sealW = sealH * IMG.seal.width / IMG.seal.height;
    const base = y - 62;
    page.drawImage(IMG.sig, { x: M, y: base + 4, width: sigW, height: sigH });
    page.drawImage(IMG.seal, { x: M + sigW + 10, y: base + 2, width: sealW, height: sealH });
    hline(M, M + CW / 2 - 10, base, NAVY, 0.9);
    text('A.O. Abdulwaheed', M, base - 14, { font: F.b, size: 10, color: NAVY });
    text('For: Awal Global Consults Limited — Director', M, base - 26, { size: 7.8 });
    hline(M + CW / 2 + 10, M + CW, base - 14, GREY, 0.6);
    text(clientLabel, M + CW / 2 + 10, base - 26, { size: 7.8 });
    y = base - 32;
  };

  // ---- body per kind ----
  if (doc.kind === 'quote') {
    meta([['Quote No.', doc.number], ['Date issued', dayShort(doc.issued_at)], ['Valid until', dayShort(doc.valid_until)]]);
    parties({ label: 'Prepared for', name: cl.name, lines: [cl.address, cl.phone, cl.email] }, { label: 'Service category', name: doc.category || '', lines: [] });
    table([{ label: 'Service', w: 0.3 }, { label: "What's included", w: 0.36 }, { label: 'Timeline', w: 0.14 }, { label: 'Amount (₦)', w: 0.2, align: 'right' }],
      items.map(i => [{ main: i.description, bold: true, subs: [i.qty > 1 ? `Qty ${i.qty} × ${plain(i.unit)}` : '', i.gov ? 'Government fee (no VAT)' : ''] }, i.detail || '', i.timeline || '', i.amount ? plain(i.amount) : '[Custom quote]']));
    sums('Estimated Total');
    boxes(["What's included", 'Our professional service charge, all government fees listed above, and digital delivery of documents. No hidden charges.'],
      ['Terms & validity', 'This quotation is valid for 14 days from the date of issue. Prices may be revised after expiry or if scope changes. A formal invoice will be issued to confirm engagement and begin work.']);
    if (doc.notes) para(doc.notes);
    signoff('Client Confirmation (accept & return to proceed)');
  }

  if (doc.kind === 'invoice') {
    meta([['Invoice No.', doc.number], ['Date issued', dayShort(doc.issued_at)], ['Due date', dayShort(doc.due_at)]]);
    parties({ label: 'Billed to', name: cl.name, lines: [cl.address, cl.phone, cl.email] }, { label: 'Client tax details', name: '', lines: [`Client TIN: ${cl.tin || 'Not provided'}`, quote ? `Quotation: ${quote.number}` : ''] });
    table([{ label: 'S/N', w: 0.07 }, { label: 'Description of service', w: 0.47 }, { label: 'Qty', w: 0.08, align: 'right' }, { label: 'Unit price (₦)', w: 0.19, align: 'right' }, { label: 'Amount (₦)', w: 0.19, align: 'right' }],
      items.map((i, n) => [String(n + 1), { main: i.description, subs: [i.detail, i.gov ? 'Government fee paid on your behalf (no VAT)' : ''] }, String(i.qty), plain(i.unit), plain(i.amount)]));
    sums('Total Due');
    words('Amount in words:', nairaWords(doc.total));
    boxes(['Payment details', PAYMENT_DETAILS],
      ['Terms', 'Payment is due on or before the date above. Work commences and documents are released upon confirmation of payment. This invoice covers the services listed only; any additional government fees arising from changes to your request will be communicated before proceeding.']);
    if (doc.notes) para(doc.notes);
    signoff('Client Acknowledgement (optional)');
  }

  if (doc.kind === 'receipt') {
    const inv = invoice || {};
    const stored = /^balance:(\d+)$/.exec(doc.notes || '');
    const balance = stored ? Number(stored[1]) : Math.max(0, (inv.total || doc.total) - (doc.amount_paid || 0));
    const what = items.map(i => i.description);
    meta([['Receipt No.', doc.number], ['Date', dayShort(doc.paid_at || doc.issued_at)], ['Against invoice No.', inv.number || '']]);
    parties({ label: 'Received from', name: cl.name, lines: [cl.address, cl.phone, cl.email] }, { label: 'Payment for', name: '', lines: [what.join(', ')] });
    table([{ label: 'Description', w: 0.4 }, { label: 'Invoice amount (₦)', w: 0.2, align: 'right' }, { label: 'Amount paid (₦)', w: 0.2, align: 'right' }, { label: 'Balance (₦)', w: 0.2, align: 'right' }],
      [[what.join(' + '), plain(inv.total || doc.total), plain(doc.amount_paid), plain(balance)]]);
    words('Amount received:', `${money(doc.amount_paid)} (${nairaWords(doc.amount_paid)})`);
    boxes(['Payment method', `${doc.payment_method || ''}${doc.payment_ref ? `. Transaction reference: ${doc.payment_ref}` : ''}`],
      ['Note', 'This receipt confirms payment received and is not a tax invoice. Please keep it with your invoice (number above) for your records.']);
    signoff('Client Signature (optional)');
  }

  if (doc.kind === 'engagement') {
    const inv = invoice || {}, rc = receipt || {}, qt = quote || {};
    const service = doc.category || items.map(i => i.description).join(', ');
    const R = t => ({ t, font: F.r }), B = t => ({ t, font: F.b });
    const P = runs => para(runs, { size: 9.3, lead: 1.55, after: 6 });
    const head = t => { ensure(40); y -= 4; para([B(t)], { size: 9.6, color: NAVY, lead: 1.4, after: 1 }); };
    P([R('Ref: '), B(doc.number), R(`\nDate: ${dayLong(doc.issued_at)}`)]);
    P([B(cl.name || ''), R(cl.address ? `\n${cl.address}` : '')]);
    P([R(`Dear ${cl.salutation || cl.name || 'Sir/Madam'},`)]);
    para([B(`RE: CONFIRMATION OF ENGAGEMENT FOR ${service.toUpperCase()}`)], { size: 9.3, color: NAVY, lead: 1.5, after: 6 });
    P([R(`Thank you for your payment. We confirm receipt against Invoice No. ${inv.number || ''} and Receipt No. ${rc.number || ''} and are pleased to formally confirm our engagement on the following terms.`)]);
    head('1. Scope of Engagement');
    P([R(`Awal Global Consults Limited ("the Firm") shall provide ${doc.notes || service} on behalf of ${cl.name} ("the Client")${qt.number ? `, as more particularly described in Quotation No. ${qt.number}` : ''}.`)]);
    head('2. Fees');
    P([R(feesSentence(inv, rc, doc))]);
    head('3. Client Responsibilities');
    P([R('The Client agrees to promptly provide accurate information and documentation reasonably required by the Firm to perform the services. Delays in providing such information may affect delivery timelines quoted.')]);
    head('4. Timelines');
    P([R('Estimated timelines communicated by the Firm are based on standard processing periods at the relevant regulatory bodies (including CAC and NRS) and are indicative only; the Firm does not control, and cannot guarantee, third-party regulatory processing times.')]);
    head('5. Confidentiality');
    P([R('Each party shall keep confidential all non-public information received from the other in connection with this engagement and shall not disclose it to any third party except as required to perform the services or by law.')]);
    head('6. Limitation of Liability');
    P([R("The Firm shall perform the services with reasonable skill and care. The Firm's liability in connection with this engagement shall not exceed the total fees paid by the Client for the specific service giving rise to the claim.")]);
    head('7. Termination');
    P([R('Either party may terminate this engagement on written notice where the other party is in material breach of these terms. Fees for work already performed up to the date of termination remain payable.')]);
    head('8. Governing Law');
    P([R('This engagement is governed by the laws of the Federal Republic of Nigeria.')]);
    P([R('Please sign and return a copy of this letter to confirm your acceptance of these terms.')]);
    P([R('Yours sincerely,\n'), B('FOR: AWAL GLOBAL CONSULTS LIMITED')]);
    signoff('Client Acceptance — Signature & Date');
  }

  // ---- footer on every page ----
  const FOOT = [
    [{ t: 'Awal Global Consults Limited', font: F.b }, { t: ' · RC-9282103 · Registered Office: 12 Hakeem Balogun Street, Agidingbi, Ikeja, Lagos State, Nigeria', font: F.r }],
    [{ t: '+234 703 833 6596 · info@awalglobal.com.ng · awalglobal.com.ng', font: F.r }],
    [{ t: 'Directors: A.O. Abdulwaheed · A.B. Jimoh · I.A. Adeleke · Former name(s): None · Nationality of non-Nigerian director(s): N/A, all directors Nigerian', font: F.r }],
    [{ t: 'TIN: 2622489142694 (unified NRS Tax ID)', font: F.r }],
    [{ t: 'Disclosed pursuant to Sections 304(1) & (2) and 729(1)(c) of the Companies and Allied Matters Act 2020', font: F.r }]
  ];
  pages.forEach((p, i) => {
    page = p;
    let fy = BOTTOM + FOOT_H - 14;
    hline(M, M + CW, fy + 8);
    for (const runs of FOOT) { for (const ln of wrapRuns(runs, 6.4, CW)) { drawLine(ln, M, fy - 2, 6.4, GREY); fy -= 8.6; } }
    if (pages.length > 1) text(`${doc.number} · Page ${i + 1} of ${pages.length}`, M + CW, BOTTOM + FOOT_H - 3, { size: 6.4, align: 'right' });
  });

  // Object streams make files ~10% smaller but cost several times the CPU
  return pdf.save({ useObjectStreams: false });
}
