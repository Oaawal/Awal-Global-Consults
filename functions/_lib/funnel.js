/**
 * The client funnel for the dashboard: of the requests received in a period, how many were
 * quoted, invoiced and paid, what they have paid so far, and which channels and services
 * the paying clients came from. Website visitor numbers live in Google Analytics, not here.
 */
const QUOTED = new Set(['quote_sent', 'awaiting_documents', 'paid', 'filed', 'approved', 'delivered']);
const PAID = new Set(['paid', 'filed', 'approved', 'delivered']);
export const PERIODS = { 30: 'Last 30 days', 90: 'Last 90 days', 365: 'Last 12 months', all: 'All time' };

/** One label for where a client came from: their own answer first, then what the site saw, then import channel. */
export function sourceOf(c) {
  let f = {};
  try { f = JSON.parse(c.form_data || '{}') || {}; } catch (e) { /* erased or empty */ }
  if (f['Heard About Us']) return f['Heard About Us'];
  const auto = String(f['Found Us Via'] || '').toLowerCase();
  if (auto) {
    if (/google ads|gclid/.test(auto)) return 'Google Ads';
    const camp = /campaign: ([^;/]+)/.exec(auto);
    if (camp) return camp[1].trim().replace(/^\w/, m => m.toUpperCase()) + ' (campaign link)';
    if (/google\./.test(auto)) return 'Google search';
    if (/instagram|facebook|fbclid/.test(auto)) return 'Instagram / Facebook';
    if (/linkedin|lnkd/.test(auto)) return 'LinkedIn';
    if (/t\.co|twitter|x\.com/.test(auto)) return 'X (Twitter)';
    if (/wa\.me|whatsapp/.test(auto)) return 'WhatsApp';
    if (/bing|duckduckgo|yahoo/.test(auto)) return 'Other search engine';
    const from = /from ([^;]+)/.exec(auto);
    return from ? `Link on ${from[1].trim()}` : 'Came straight to the site';
  }
  const manual = /^manual:(.+)$/.exec(c.source_page || '');
  if (manual) return `${manual[1]} (earlier records)`;
  return 'Not recorded';
}

export async function funnelStats(env, period) {
  const days = Number(period) || 0;
  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : '0000';
  const [cases, docs, received] = await env.DB.batch([
    env.DB.prepare("SELECT id, kind, services, status, form_data, source_page FROM cases WHERE created_at >= ?1 AND NOT (kind = 'enquiry' AND status = 'converted')").bind(since),
    env.DB.prepare("SELECT b.case_id, b.kind, b.amount_paid FROM billing_docs b JOIN cases c ON c.id = b.case_id WHERE c.created_at >= ?1 AND b.status != 'void' AND b.kind IN ('quote', 'invoice')").bind(since),
    env.DB.prepare("SELECT COALESCE(SUM(amount_paid), 0) AS total, COUNT(*) AS n FROM billing_docs WHERE kind = 'receipt' AND status != 'void' AND COALESCE(paid_at, issued_at) >= ?1").bind(since)
  ]);
  const byCase = new Map();
  for (const d of docs.results || []) {
    const x = byCase.get(d.case_id) || { quote: false, invoice: false, paid: 0 };
    if (d.kind === 'quote') x.quote = true;
    if (d.kind === 'invoice') { x.invoice = true; x.paid += d.amount_paid || 0; }
    byCase.set(d.case_id, x);
  }
  const out = { requests: 0, applications: 0, enquiries: 0, quoted: 0, invoiced: 0, paying: 0, revenue: 0, sources: new Map(), services: new Map(),
    received: (received.results[0] || {}).total || 0, receipts: (received.results[0] || {}).n || 0 };
  const bump = (map, key, paying, revenue) => { const r = map.get(key) || { requests: 0, paying: 0, revenue: 0 }; r.requests++; if (paying) r.paying++; r.revenue += revenue; map.set(key, r); };
  for (const c of cases.results || []) {
    const b = byCase.get(c.id) || { quote: false, invoice: false, paid: 0 };
    const paying = b.paid > 0 || (c.kind === 'application' && PAID.has(c.status));
    const invoiced = b.invoice || paying;
    const quoted = b.quote || invoiced || (c.kind === 'application' && QUOTED.has(c.status));
    out.requests++;
    if (c.kind === 'application') out.applications++; else out.enquiries++;
    if (quoted) out.quoted++;
    if (invoiced) out.invoiced++;
    if (paying) out.paying++;
    out.revenue += b.paid;
    bump(out.sources, sourceOf(c), paying, b.paid);
    for (const svc of String(c.services || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 6)) bump(out.services, svc, paying, 0);
  }
  const rows = map => [...map.entries()].map(([name, r]) => ({ name, ...r })).sort((a, b) => b.paying - a.paying || b.requests - a.requests);
  return { ...out, sources: rows(out.sources), services: rows(out.services).slice(0, 10), conversion: out.requests ? Math.round(out.paying * 1000 / out.requests) / 10 : 0 };
}
