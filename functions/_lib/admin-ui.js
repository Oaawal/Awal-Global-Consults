/**
 * Admin dashboard look and feel: the app shell (sidebar on desktop, tab bar on
 * phones), shared styles, icons, and small building blocks used by the pages
 * in admin-views.js. Server-rendered and script-free.
 */
import { statusInfo } from './cases.js';

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const TZ = 'Africa/Lagos';

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
}

/** "just now", "3 hours ago", "2 days ago", or the date. */
export function ago(iso) {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  return fmtDay(iso);
}

export function fmtSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
}

// ── Icons (24px stroke icons) ───────────────────────────────────
const ICON_PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
  cases: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  clients: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  chat: '<path d="M4 20l1.5-4A8 8 0 1 1 9 19.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>'
};

export function icon(name, size = 20) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

// ── Status pills ────────────────────────────────────────────────
const STATUS_TONE = {
  new: 'amber', quote_sent: 'blue', awaiting_documents: 'amber', paid: 'blue', filed: 'violet',
  approved: 'green', delivered: 'green', closed: 'grey', cancelled: 'grey', contacted: 'blue', converted: 'green'
};

export function statusPill(kind, status) {
  return `<span class="pill ${STATUS_TONE[status] || 'blue'}">${esc(statusInfo(kind, status).label)}</span>`;
}

export function pill(text, tone = 'grey') {
  return `<span class="pill ${tone}">${esc(text)}</span>`;
}

export function avatar(name, cls = '') {
  return `<span class="avatar ${cls}">${esc(initials(name))}</span>`;
}

export function emptyState(iconName, title, text = '') {
  return `<div class="empty">${icon(iconName, 28)}<div class="empty-title">${esc(title)}</div>${text ? `<div class="muted">${esc(text)}</div>` : ''}</div>`;
}

export function flashHtml(flash) {
  if (!flash) return '';
  const [tone, text] = flash;
  return `<div class="flash ${tone}">${icon(tone === 'ok' ? 'check' : 'alert', 18)}<span>${esc(text)}</span></div>`;
}

// ── Styles ──────────────────────────────────────────────────────
const STYLE = `
:root{
  --navy:#0F3A5F;--navy-900:#0A2C48;--navy-800:#0d3556;--blue:#2F80ED;--blue-50:#EAF3FE;
  --bg:#F3F6FA;--card:#fff;--line:#E3EAF2;--line-2:#EEF2F7;--text:#1C2733;--muted:#677585;
  --green:#1F7A4D;--green-50:#E6F4EC;--amber:#9A5B00;--amber-50:#FFF3DC;--red:#B3261E;--red-50:#FDECEA;
  --violet:#5B3FB3;--violet-50:#EFEAFB;--grey-50:#EEF1F4;
  --radius:14px;--shadow:0 1px 2px rgba(15,58,95,.05),0 4px 16px rgba(15,58,95,.05);
  --serif:Georgia,"Times New Roman",serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--bg);color:var(--text);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--navy)}
.ic{flex:none;display:block}
.muted{color:var(--muted)}
.small{font-size:13px}

/* App shell */
.app{display:flex;min-height:100vh}
.side{width:244px;flex:none;background:linear-gradient(180deg,var(--navy-900),var(--navy-800));color:#d9e6f2;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;padding:20px 14px}
.brand{display:flex;align-items:center;gap:10px;padding:4px 8px 22px;color:#fff;text-decoration:none}
.brand-mark{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--blue),#6FB2F5);display:grid;place-items:center;font:700 15px var(--serif);color:#fff}
.brand-name{font:700 16px/1.2 var(--serif)}
.brand-sub{font-size:11px;color:#9fb7cd;letter-spacing:.3px}
.nav{display:flex;flex-direction:column;gap:2px}
.nav a{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;color:#c9d9e8;text-decoration:none;font-weight:500}
.nav a:hover{background:rgba(255,255,255,.06);color:#fff}
.nav a.on{background:rgba(111,178,245,.16);color:#fff}
.nav .count{margin-left:auto;background:var(--blue);color:#fff;font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px}
.side-foot{margin-top:auto;border-top:1px solid rgba(255,255,255,.08);padding-top:14px}
.who{display:flex;align-items:center;gap:10px;padding:6px 8px 10px;font-size:13px;color:#c9d9e8;word-break:break-all}
.side-foot button{display:flex;align-items:center;gap:10px;width:100%;background:none;border:0;color:#c9d9e8;padding:10px 12px;border-radius:10px;font:500 14px var(--sans);cursor:pointer}
.side-foot button:hover{background:rgba(255,255,255,.06);color:#fff}

.main{flex:1;min-width:0;display:flex;flex-direction:column}
.card,.content{min-width:0}
.topbar{display:none}
.content{width:100%;max-width:1080px;margin:0 auto;padding:28px 28px 48px}
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap}
.page-head h1{font:700 26px/1.2 var(--serif);color:var(--navy);margin:0}
.page-head .sub{color:var(--muted);margin-top:4px}
.crumb{display:inline-flex;align-items:center;gap:4px;color:var(--muted);text-decoration:none;font-size:14px;margin-bottom:8px}
.crumb:hover{color:var(--navy)}

/* Cards & layout */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:16px}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 0}
.card-head h2{font:600 15px var(--sans);margin:0;color:var(--navy)}
.card-head a{font-size:13px;font-weight:600;text-decoration:none}
.card-body{padding:14px 18px 18px}
.grid{display:grid;gap:16px}
.grid>*{min-width:0}
.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.grid-3{grid-template-columns:2fr 1fr}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:20px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px;text-decoration:none;color:inherit;display:block}
.stat:hover{border-color:#c9d8e8}
.stat-top{display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:13px;font-weight:600}
.stat-ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center}
.stat-num{font:700 30px/1 var(--serif);color:var(--navy);margin-top:12px}
.stat-note{font-size:12px;color:var(--muted);margin-top:4px}
.tone-amber{background:var(--amber-50);color:var(--amber)}
.tone-blue{background:var(--blue-50);color:var(--blue)}
.tone-green{background:var(--green-50);color:var(--green)}
.tone-violet{background:var(--violet-50);color:var(--violet)}
.tone-red{background:var(--red-50);color:var(--red)}

/* Lists */
.rows{list-style:none;margin:0;padding:0}
.row{display:flex;align-items:center;gap:12px;padding:12px 18px;border-top:1px solid var(--line-2);text-decoration:none;color:inherit}
.rows .row:first-child{border-top:0}
a.row:hover{background:#F8FAFD}
.row-main{flex:1;min-width:0}
.row-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row-sub{font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row-side{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none}
.ref{font-weight:700;color:var(--navy);font-size:13px;letter-spacing:.2px}
.avatar{width:38px;height:38px;border-radius:50%;background:var(--blue-50);color:var(--navy);display:grid;place-items:center;font-weight:700;font-size:13px;flex:none}
.avatar.lg{width:52px;height:52px;font-size:17px}

/* Table (desktop case list) */
table.list{width:100%;border-collapse:collapse}
table.list th{text-align:left;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;padding:12px 18px;border-bottom:1px solid var(--line)}
table.list td{padding:13px 18px;border-top:1px solid var(--line-2);vertical-align:middle}
table.list tr:first-child td{border-top:0}
table.list tr.link{cursor:pointer}
table.list tr.link:hover td{background:#F8FAFD}
table.list td a.cover{color:inherit;text-decoration:none;display:block}
.only-mobile{display:none}

/* Pills, tabs, chips */
.pill{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;white-space:nowrap}
.pill.amber{background:var(--amber-50);color:var(--amber)}
.pill.blue{background:var(--blue-50);color:#1d5fb8}
.pill.green{background:var(--green-50);color:var(--green)}
.pill.violet{background:var(--violet-50);color:var(--violet)}
.pill.grey{background:var(--grey-50);color:#56616d}
.pill.red{background:var(--red-50);color:var(--red)}
.chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;margin-bottom:14px;scrollbar-width:none}
.chips a{flex:none;display:inline-flex;gap:6px;align-items:center;padding:7px 14px;border-radius:999px;border:1px solid var(--line);background:#fff;text-decoration:none;font-size:14px;font-weight:500;color:var(--text)}
.chips a .n{color:var(--muted);font-weight:600}
.chips a.on{background:var(--navy);border-color:var(--navy);color:#fff}
.chips a.on .n{color:#b9d3ee}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:18px;overflow-x:auto;scrollbar-width:none}
.tabs a{flex:none;padding:10px 14px;text-decoration:none;color:var(--muted);font-weight:600;font-size:14px;border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs a.on{color:var(--navy);border-color:var(--blue)}

/* Forms */
label{display:block;font-size:13px;font-weight:600;margin:12px 0 6px;color:#3b4855}
input,select,textarea{font:inherit;width:100%;padding:10px 12px;border:1px solid #d5dfe9;border-radius:10px;background:#fff;color:var(--text)}
input:focus,select:focus,textarea:focus{outline:2px solid #b9d6fb;border-color:var(--blue)}
textarea{min-height:88px;resize:vertical}
.check{display:flex;gap:10px;align-items:flex-start;font-weight:500;margin:14px 0 0;color:var(--text)}
.check input{width:18px;height:18px;margin-top:2px;flex:none}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font:600 14px var(--sans);padding:10px 16px;min-height:42px;border-radius:10px;border:1px solid transparent;background:var(--blue);color:#fff;text-decoration:none;cursor:pointer;white-space:nowrap}
.btn:hover{filter:brightness(.96)}
.btn.ghost{background:#fff;color:var(--navy);border-color:#d5dfe9}
.btn.wa{background:#1FAF55}
.btn.danger{background:var(--red)}
.btn.ghost.danger{background:#fff;color:var(--red);border-color:#f0c4c0}
.btn.sm{min-height:34px;padding:6px 12px;font-size:13px}
.btn.block{width:100%}
.btn-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.search{position:relative;flex:1;min-width:200px}
.search .ic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted)}
.search input{padding-left:38px}
.toolbar{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
details.more{border-top:1px solid var(--line-2);margin-top:16px;padding-top:12px}
details.more summary{cursor:pointer;font-weight:600;font-size:14px;color:var(--navy);list-style:none}
details.more summary::-webkit-details-marker{display:none}
details.more summary::before{content:'+ '}
details.more[open] summary::before{content:'– '}

/* Case header & stepper */
.case-head{display:flex;gap:16px;align-items:flex-start;padding:20px}
.case-head h1{font:700 24px/1.2 var(--serif);color:var(--navy);margin:2px 0 4px}
.case-actions{display:flex;gap:8px;flex-wrap:wrap;padding:0 20px 20px}
.stepper{display:flex;gap:0;overflow-x:auto;padding:4px 2px 2px;scrollbar-width:none}
.step{flex:1 0 86px;text-align:center;position:relative;font-size:12px;line-height:1.35;color:var(--muted);padding:30px 4px 0}
.step::before{content:'';position:absolute;top:10px;left:-50%;width:100%;height:2px;background:var(--line)}
.step:first-child::before{display:none}
.step .dot{position:absolute;top:2px;left:50%;transform:translateX(-50%);width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid var(--line);z-index:1}
.step.done{color:var(--text)}
.step.done::before,.step.now::before{background:var(--blue)}
.step.done .dot{background:var(--blue);border-color:var(--blue)}
.step.now{color:var(--navy);font-weight:700}
.step.now .dot{border-color:var(--blue);box-shadow:0 0 0 4px #d7e8fd}
.next-box{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--blue-50);border-radius:12px;padding:14px 16px;margin-top:16px}
.kv{display:grid;grid-template-columns:minmax(120px,38%) 1fr;gap:10px 14px;font-size:14px;margin:0}
.kv dt{color:var(--muted)}
.kv dd{margin:0;word-break:break-word}
.kv dd .ic{display:inline-block;vertical-align:-3px;margin-right:4px}
.timeline{list-style:none;margin:0;padding:0}
.timeline li{display:flex;gap:12px;padding:12px 0;border-top:1px solid var(--line-2)}
.timeline li:first-child{border-top:0}
.tl-dot{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;flex:none;background:var(--grey-50);color:var(--muted)}
.tl-body{flex:1;min-width:0;font-size:14px}
.tl-note{white-space:pre-line;background:#F8FAFC;border:1px solid var(--line-2);border-radius:10px;padding:8px 12px;margin-top:6px}
.doc{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--line-2)}
.doc:first-child{border-top:0}
.doc-ic{width:40px;height:40px;border-radius:10px;background:var(--red-50);color:var(--red);display:grid;place-items:center;flex:none}
.doc-ic.img{background:var(--blue-50);color:var(--blue)}

/* Messages */
.flash{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;margin-bottom:16px;font-size:14px;font-weight:500}
.flash.ok{background:var(--green-50);color:var(--green)}
.flash.err{background:var(--red-50);color:var(--red)}
.note{display:flex;gap:10px;align-items:flex-start;background:#F8FAFC;border:1px solid var(--line-2);border-radius:12px;padding:12px 14px;font-size:14px;color:#3b4855}
.note.warn{background:var(--amber-50);border-color:#f6dfb2;color:#6d4300}
.note.danger{background:var(--red-50);border-color:#f3cbc7;color:#7d1b15}
.empty{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:18px 16px 14px;color:var(--muted)}
.empty-title{font-weight:600;color:var(--text)}

/* Login */
.login-wrap{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(1200px 600px at 10% -10%,#dbe9f8 0,transparent 60%),var(--bg)}
.login{width:100%;max-width:400px}
.login .card{padding:28px}
.login h1{font:700 24px var(--serif);color:var(--navy);margin:16px 0 6px}
.code-input{font-size:26px;letter-spacing:10px;text-align:center;font-weight:700}

/* Phones */
@media (max-width:860px){
  .side{display:none}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--navy-900);color:#fff;padding:12px 16px;position:sticky;top:0;z-index:10}
  .topbar .brand{padding:0}
  .topbar form{margin:0}
  .topbar button{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.08);border:0;color:#d9e6f2;border-radius:9px;padding:7px 10px;font:600 13px var(--sans)}
  .content{padding:18px 14px 96px}
  .page-head h1{font-size:22px}
  .bottom-nav{position:fixed;left:0;right:0;bottom:0;z-index:10;background:#fff;border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(5,1fr);padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
  .bottom-nav a{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;font-weight:600;color:var(--muted);text-decoration:none;padding:4px 0;position:relative}
  .bottom-nav a.on{color:var(--blue)}
  .bottom-nav .count{position:absolute;top:0;left:calc(50% + 6px);background:var(--red);color:#fff;font-size:10px;border-radius:999px;padding:0 5px}
  .stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .stat{padding:14px}
  .stat-num{font-size:26px}
  .grid-2,.grid-3{grid-template-columns:minmax(0,1fr)}
  html,body{overflow-x:hidden}
  .only-desktop{display:none}
  .only-mobile{display:block}
  .row{padding:12px 14px}
  .card-head{padding:14px 14px 0}
  .card-body{padding:12px 14px 16px}
  .case-head{padding:16px}
  .case-actions{padding:0 16px 16px}
  .case-actions .btn{flex:1}
  .tabs a{padding:10px 9px}
  .kv{grid-template-columns:1fr;gap:2px}
  .kv dd{margin-bottom:10px}
}
@media (min-width:861px){.bottom-nav{display:none}}
`;

export const NAV = [
  { key: 'overview', label: 'Overview', href: '/admin/', icon: 'home' },
  { key: 'cases', label: 'Cases', href: '/admin/cases', icon: 'cases' },
  { key: 'clients', label: 'Clients', href: '/admin/clients', icon: 'clients' },
  { key: 'records', label: 'Records', href: '/admin/records', icon: 'shield' },
  { key: 'activity', label: 'Activity', href: '/admin/activity', icon: 'activity' }
];

function brand() {
  return `<a class="brand" href="/admin/"><span class="brand-mark">A</span><span><div class="brand-name">Awal Global</div><div class="brand-sub">Case Manager</div></span></a>`;
}

/**
 * Full page inside the app shell.
 * @param {object} o
 * @param {string} o.title
 * @param {string} o.active - NAV key
 * @param {string} o.body
 * @param {string} o.admin - signed-in email
 * @param {object} [o.badges] - counts shown on nav items, e.g. { cases: 3 }
 */
export function shell({ title, active, body, admin, badges = {} }) {
  const navLinks = NAV.map(n => `<a href="${n.href}" class="${n.key === active ? 'on' : ''}">${icon(n.icon)}<span>${n.label}</span>${badges[n.key] ? `<span class="count">${badges[n.key]}</span>` : ''}</a>`).join('');
  const logout = '<form method="post" action="/admin/logout"><button type="submit">' + icon('logout', 18) + '<span>Log out</span></button></form>';
  return htmlDocument(title, `
<div class="app">
  <aside class="side">
    ${brand()}
    <nav class="nav">${navLinks}</nav>
    <div class="side-foot">
      <div class="who">${avatar(admin)}<span>${esc(admin)}</span></div>
      ${logout}
    </div>
  </aside>
  <div class="main">
    <div class="topbar">${brand()}${logout}</div>
    <main class="content">${body}</main>
  </div>
</div>
<nav class="bottom-nav">${NAV.map(n => `<a href="${n.href}" class="${n.key === active ? 'on' : ''}">${icon(n.icon, 22)}<span>${n.label}</span>${badges[n.key] ? `<span class="count">${badges[n.key]}</span>` : ''}</a>`).join('')}</nav>`);
}

/** Bare HTML document (used by the shell and the sign-in page). */
export function htmlDocument(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0A2C48">
<title>${esc(title)} · Awal Case Manager</title>
<style>${STYLE}</style>
</head>
<body>${body}</body>
</html>`;
}

export function pageHead(title, sub = '', right = '', back = null) {
  return `<div class="page-head"><div>${back ? `<a class="crumb" href="${esc(back.href)}">${icon('back', 16)}${esc(back.label)}</a>` : ''}<h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${right}</div>`;
}
