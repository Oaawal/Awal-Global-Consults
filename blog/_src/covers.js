// Illustrated post covers, drawn as inline SVG so they need no image files
// and stay sharp at any size. Each hub has its own motif (see `cover` in
// hubs.js); small details vary per post (seeded from the slug) so covers in
// the same hub look related but not identical.

const NAVY = '#0F3A5F';
const BLUE = '#2F80ED';
const GOLD = '#C9A646';
const LINE = '#9FB9D2';

const PALETTES = {
  registration: { bg: '#E9F2FC', soft: '#D3E5F8', accent: BLUE },
  compliance: { bg: '#E8F3EF', soft: '#CFE6DD', accent: '#2E7D5B' },
  brand: { bg: '#F7F0DF', soft: '#EEDFBA', accent: GOLD },
  travel: { bg: '#EAF0F7', soft: '#D5E1EE', accent: NAVY },
  globe: { bg: '#E6F1F6', soft: '#CBE2EC', accent: '#2A7A9B' },
  data: { bg: '#EEF0F6', soft: '#DADFEC', accent: '#5B5FC7' }
};

// Small deterministic random generator so a post's cover never changes between builds
function seeded(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function lines(x, y, widths, gap, color, sw = 6) {
  return widths.map((w, i) => `<rect x="${x}" y="${y + i * gap}" width="${w}" height="${sw}" rx="${sw / 2}" fill="${color}"/>`).join('');
}

const MOTIFS = {
  // Paperwork: a stamped form, a certificate with a ribbon seal, or a filing calendar
  registration(p, r) {
    const v = r();
    if (v < 0.34) {
      const w = [220, 180, 240, 150, 200].map(x => Math.round(x * (0.75 + r() * 0.3)));
      return `<rect x="110" y="48" width="300" height="250" rx="16" fill="#fff" stroke="${p.soft}" stroke-width="2"/>
      ${lines(140, 88, w, 34, p.soft)}
      <rect x="140" y="88" width="${w[0]}" height="6" rx="3" fill="${p.accent}" opacity=".55"/>
      <circle cx="420" cy="230" r="54" fill="${p.bg}" stroke="${p.accent}" stroke-width="2.5" stroke-dasharray="6 6"/>
      <circle cx="420" cy="230" r="34" fill="${p.soft}"/>
      <path d="M404 230l11 11 22-24" stroke="${p.accent}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (v < 0.67) {
      return `<rect x="120" y="58" width="360" height="230" rx="14" fill="#fff" stroke="${p.soft}" stroke-width="2"/>
      <rect x="136" y="74" width="328" height="198" rx="8" fill="none" stroke="${GOLD}" stroke-width="2" opacity=".7"/>
      <rect x="220" y="104" width="160" height="10" rx="5" fill="${NAVY}" opacity=".8"/>
      ${lines(190, 136, [220, 180, 200].map(x => Math.round(x * (0.8 + r() * 0.2))), 24, p.soft)}
      <path d="M392 236l-14 46 18-10 16 14 4-48z" fill="${p.accent}"/><path d="M412 236l10 46 10-16 18 6-12-44z" fill="${p.accent}" opacity=".75"/>
      <circle cx="410" cy="226" r="30" fill="${GOLD}"/><circle cx="410" cy="226" r="20" fill="none" stroke="#fff" stroke-width="2.5"/>`;
    }
    const due = 1 + Math.floor(r() * 4);
    const cells = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
      const hit = row === 1 && col === due;
      cells.push(`<rect x="${178 + col * 52}" y="${132 + row * 46}" width="40" height="34" rx="7" fill="${hit ? p.accent : p.bg}" ${hit ? '' : `stroke="${p.soft}" stroke-width="1.5"`}/>`);
    }
    return `<rect x="156" y="62" width="300" height="250" rx="18" fill="#fff" stroke="${p.soft}" stroke-width="2"/>
      <rect x="156" y="62" width="300" height="52" rx="18" fill="${NAVY}"/><rect x="156" y="96" width="300" height="18" fill="${NAVY}"/>
      <rect x="206" y="48" width="10" height="34" rx="5" fill="${p.soft}"/><rect x="396" y="48" width="10" height="34" rx="5" fill="${p.soft}"/>
      ${cells.join('')}`;
  },
  // Compliance: a shield beside a checklist, a padlock, or a clipboard
  compliance(p, r) {
    const v = r();
    if (v < 0.34) {
      const rows = [0, 1, 2, 3].map(i => {
        const done = r() > 0.3;
        return `<rect x="330" y="${92 + i * 46}" width="22" height="22" rx="6" fill="${done ? p.accent : '#fff'}" stroke="${p.accent}" stroke-width="2"/>
        ${done ? `<path d="M335 ${103 + i * 46}l5 5 8-9" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>` : ''}
        <rect x="366" y="${100 + i * 46}" width="${Math.round(110 + r() * 80)}" height="6" rx="3" fill="${p.soft}"/>`;
      }).join('');
      return `<path d="M200 60l90 32v74c0 58-40 98-90 118-50-20-90-60-90-118V92z" fill="#fff" stroke="${p.soft}" stroke-width="3"/>
      <path d="M200 92l58 20v54c0 40-26 68-58 82-32-14-58-42-58-82v-54z" fill="${p.soft}"/>
      <path d="M176 172l18 18 34-38" stroke="${p.accent}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      ${rows}`;
    }
    if (v < 0.67) {
      const dots = [0, 1, 2, 3, 4, 5].map(i => `<circle cx="${380 + (i % 3) * 40}" cy="${120 + Math.floor(i / 3) * 40}" r="${8 + Math.round(r() * 6)}" fill="${i % 2 ? p.soft : p.accent}" opacity="${i % 2 ? 1 : 0.5}"/>`).join('');
      return `<path d="M210 150v-30a60 60 0 0 1 120 0v30" stroke="${NAVY}" stroke-width="16" fill="none"/>
      <rect x="180" y="150" width="180" height="150" rx="22" fill="${NAVY}"/>
      <circle cx="270" cy="212" r="18" fill="${GOLD}"/><rect x="263" y="220" width="14" height="40" rx="6" fill="${GOLD}"/>
      ${dots}`;
    }
    return `<rect x="190" y="64" width="220" height="250" rx="16" fill="#fff" stroke="${p.soft}" stroke-width="2.5"/>
      <rect x="250" y="50" width="100" height="34" rx="10" fill="${p.accent}"/>
      ${[0, 1, 2, 3].map(i => `<circle cx="226" cy="${126 + i * 44}" r="9" fill="${i < 3 ? p.accent : p.soft}"/><rect x="246" y="${122 + i * 44}" width="${Math.round(100 + r() * 50)}" height="8" rx="4" fill="${p.soft}"/>`).join('')}
      <path d="M430 110l40 40-90 90-46 10 10-46z" fill="${GOLD}" opacity=".85"/>`;
  },
  // A trademark badge and a brand tag
  brand(p, r) {
    const tilt = Math.round(-14 + r() * 10);
    return `<g transform="rotate(${tilt} 400 180)"><path d="M330 110h150a14 14 0 0 1 14 14v112a14 14 0 0 1-14 14H330l-50-70z" fill="#fff" stroke="${p.soft}" stroke-width="2.5"/>
      <circle cx="318" cy="180" r="9" fill="${p.bg}" stroke="${p.accent}" stroke-width="2"/>
      ${lines(350, 150, [110, 80, 96], 28, p.soft)}</g>
      <circle cx="190" cy="170" r="84" fill="#fff" stroke="${p.soft}" stroke-width="2.5"/>
      <circle cx="190" cy="170" r="62" fill="none" stroke="${p.accent}" stroke-width="5"/>
      <text x="190" y="196" text-anchor="middle" font-family="Georgia,serif" font-size="72" font-weight="700" fill="${p.accent}">R</text>`;
  },
  // A passport with a flight path; Nigeria's green passport or a navy one, sometimes with a visa stamp
  travel(p, r) {
    const y = Math.round(60 + r() * 60);
    const book = r() > 0.5 ? '#1E5B3A' : NAVY;
    const x = Math.round(120 + r() * 50);
    const stamp = r() > 0.4
      ? `<g transform="rotate(${Math.round(-20 + r() * 40)} ${x + 230} 250)"><rect x="${x + 190}" y="222" width="96" height="56" rx="8" fill="none" stroke="${GOLD}" stroke-width="3"/><path d="M${x + 204} 242h68M${x + 204} 258h44" stroke="${GOLD}" stroke-width="3"/></g>` : '';
    const curve = r() > 0.5
      ? `M${x + 190} ${y + 190}C${x + 240} ${y + 80} ${x + 300} ${y + 50} 520 ${y}`
      : `M${x + 190} ${y + 120}C${x + 260} ${y + 200} ${x + 330} ${y + 40} 520 ${y + 20}`;
    const end = curve.endsWith(`${y}`) ? y : y + 20;
    return `<rect x="${x}" y="70" width="170" height="230" rx="16" fill="${book}"/>
      <circle cx="${x + 85}" cy="160" r="38" fill="none" stroke="${GOLD}" stroke-width="3"/>
      <path d="M${x + 47} 160h76M${x + 85} 122c-18 22-18 54 0 76M${x + 85} 122c18 22 18 54 0 76" stroke="${GOLD}" stroke-width="2.5" fill="none"/>
      <rect x="${x + 40}" y="230" width="90" height="6" rx="3" fill="${GOLD}" opacity=".8"/><rect x="${x + 55}" y="250" width="60" height="5" rx="2.5" fill="${GOLD}" opacity=".5"/>
      ${stamp}
      <path d="${curve}" stroke="${p.accent}" stroke-width="3" stroke-dasharray="8 9" fill="none"/>
      <g transform="translate(520 ${end}) rotate(-30)"><path d="M-18 0h30l10-5v10l-10-5M-6 0l-10-14h8l14 14M-6 0l-10 14h8l14-14" fill="${p.accent}"/></g>`;
  },
  // A globe with connected points
  globe(p, r) {
    const pts = [0, 1, 2, 3, 4].map(() => [Math.round(150 + r() * 300), Math.round(80 + r() * 180)]);
    return `<circle cx="300" cy="170" r="118" fill="#fff" stroke="${p.soft}" stroke-width="2.5"/>
      <ellipse cx="300" cy="170" rx="50" ry="118" fill="none" stroke="${p.soft}" stroke-width="2"/>
      <path d="M182 170h236M196 112h208M196 228h208" stroke="${p.soft}" stroke-width="2"/>
      ${pts.slice(1).map((pt, i) => `<path d="M${pts[0][0]} ${pts[0][1]}Q300 ${40 + i * 10} ${pt[0]} ${pt[1]}" stroke="${p.accent}" stroke-width="2" fill="none" opacity=".7"/>`).join('')}
      ${pts.map((pt, i) => `<circle cx="${pt[0]}" cy="${pt[1]}" r="${i ? 7 : 10}" fill="${i ? '#fff' : p.accent}" stroke="${p.accent}" stroke-width="3"/>`).join('')}`;
  },
  // A bar chart with a trend line
  data(p, r) {
    const bars = [0, 1, 2, 3, 4].map(i => Math.round(60 + r() * 140));
    return `${bars.map((h, i) => `<rect x="${150 + i * 66}" y="${280 - h}" width="44" height="${h}" rx="8" fill="${i === 3 ? p.accent : p.soft}" opacity="${i === 3 ? 0.8 : 1}"/>`).join('')}
      <path d="M140 280h340" stroke="${LINE}" stroke-width="2"/>
      <polyline points="${bars.map((h, i) => `${172 + i * 66},${262 - h}`).join(' ')}" fill="none" stroke="${NAVY}" stroke-width="3"/>
      ${bars.map((h, i) => `<circle cx="${172 + i * 66}" cy="${262 - h}" r="5" fill="#fff" stroke="${NAVY}" stroke-width="2.5"/>`).join('')}`;
  }
};

/** Inline SVG cover for a post. */
function coverSvg(style, seed, label = '') {
  const p = PALETTES[style] || PALETTES.registration;
  const r = seeded(seed);
  const motif = (MOTIFS[style] || MOTIFS.registration)(p, r);
  // Faint dotted grid in the background, like ruled paper
  const dots = [];
  for (let x = 30; x < 600; x += 30) for (let y = 30; y < 340; y += 30) dots.push(`<circle cx="${x}" cy="${y}" r="1.2"/>`);
  return `<svg class="cover-svg" viewBox="0 0 600 340" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label.replace(/"/g, '&quot;')}" xmlns="http://www.w3.org/2000/svg">
  <rect width="600" height="340" fill="${p.bg}"/><g fill="${p.soft}">${dots.join('')}</g>${motif}</svg>`;
}

module.exports = { coverSvg };
