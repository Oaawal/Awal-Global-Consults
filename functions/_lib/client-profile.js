/**
 * One client's details gathered from all their cases, newest value winning,
 * so a returning client never has to send the same information twice.
 */

// Notes about the record itself rather than details of the client
const SKIP = new Set(['Bill to', 'Bill address', 'Bill TIN', 'Added from', 'Service date', 'Requested on', 'What they asked for', 'Earlier case', 'Notes', 'Other people named']);

export function clientProfile(cases) {
  const fields = {}, from = {};
  // cases arrive newest first; read oldest first so newer values replace older ones
  for (const c of [...cases].reverse()) {
    if (c.purged_at) continue;
    let f = {}; try { f = JSON.parse(c.form_data || '{}') || {}; } catch (e) {}
    for (const [k, v] of Object.entries(f)) {
      if (SKIP.has(k) || k.startsWith('_')) continue;
      const val = Array.isArray(v) ? v.join(', ') : String(v == null ? '' : v).trim();
      if (!val || /^(on|yes|true)$/i.test(val) && /consent|agree/i.test(k)) continue;
      fields[k] = val; from[k] = c.reference;
    }
  }
  return { fields, from };
}
