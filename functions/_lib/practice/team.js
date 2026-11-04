/**
 * Team & settings (/admin/team, /admin/settings, /admin/system).
 *
 *   GET  /admin/team                   team members and roles
 *   POST /admin/team/add               add a member (owners only)
 *   POST /admin/team/:email/update     change name, title, role, active (owners only)
 *   GET  /admin/settings, POST         firm details used on invoices and client links (owners only to change)
 *   GET  /admin/system                 health check: bindings, secrets, migrations, last daily run
 */
import { adminEmails, endSessionsFor } from '../admin-auth.js';
import { ROLES, SETTING_FIELDS, getSettings, text, pick } from './core.js';
import { esc, icon, pill, field, area, select, card, readOnlyNote, chips } from './ui.js';
import { avatar, fmtDate, ago, pageHead } from '../admin-ui.js';

const TABS = [
  { key: 'team', label: 'Team', href: '/admin/team' },
  { key: 'settings', label: 'Firm settings', href: '/admin/settings' },
  { key: 'system', label: 'System health', href: '/admin/system' }
];

function tabs(active) {
  return `<div class="tabs">${TABS.map(t => `<a class="${t.key === active ? 'on' : ''}" href="${t.href}">${esc(t.label)}</a>`).join('')}</div>`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function handle(ctx) {
  const { env, parts, method } = ctx;
  if (parts[0] === 'team') return team(ctx);
  if (parts[0] === 'settings') return settings(ctx);
  if (parts[0] === 'system' && method === 'GET') return system(ctx);
  return null;
}

async function team(ctx) {
  const { env, parts, method, user } = ctx;
  const envOwners = adminEmails(env);

  if (method === 'GET' && parts.length === 1) {
    const rows = (await env.DB.prepare(
      `SELECT s.*, (SELECT MAX(created_at) FROM admin_sessions a WHERE a.email = s.email) AS last_session,
              (SELECT COUNT(*) FROM cases c WHERE c.assigned_to = s.email AND c.status NOT IN ('closed','cancelled','converted')) AS open_matters,
              (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = s.email AND t.status = 'open') AS open_tasks
       FROM staff s ORDER BY s.active DESC, s.full_name`).all()).results || [];
    const listed = new Set(rows.map(r => r.email));
    const envOnly = envOwners.filter(e => !listed.has(e));

    const memberRow = (m, fromEnv) => {
      const isEnv = fromEnv || envOwners.includes(m.email);
      const editable = ctx.isOwner && !isEnv && m.email !== user.email;
      return `<div class="row" style="align-items:flex-start">
        ${avatar(m.full_name || m.email)}
        <div class="row-main">
          <div class="row-title">${esc(m.full_name || m.email)} ${m.active === 0 ? pill('Deactivated', 'grey') : ''}</div>
          <div class="row-sub">${esc([m.title, m.email].filter(Boolean).join(' · '))}</div>
          ${fromEnv ? '' : `<div class="small muted">${m.open_matters || 0} open matter${m.open_matters === 1 ? '' : 's'} · ${m.open_tasks || 0} open task${m.open_tasks === 1 ? '' : 's'} · last sign-in ${esc(m.last_session ? ago(m.last_session) : 'never')}</div>`}
          ${editable ? `<details class="more" style="margin-top:8px;padding-top:8px"><summary>Edit</summary>
            <form method="post" action="/admin/team/${encodeURIComponent(m.email)}/update" class="fgrid">
              ${field('full_name', 'Name', { value: m.full_name, required: true, max: 120 })}
              ${field('title', 'Job title', { value: m.title, max: 80, placeholder: 'e.g. Associate, Paralegal' })}
              ${field('phone', 'Phone', { value: m.phone, max: 40 })}
              ${select('role', 'Role', ROLES, { value: m.role })}
              ${select('active', 'Access', [['1', 'Can sign in'], ['0', 'Deactivated']], { value: String(m.active) })}
              <div class="full btn-row"><button class="btn ghost" type="submit">Save</button></div>
            </form></details>` : ''}
        </div>
        <div class="row-side">${pill(ROLES[m.role]?.label || m.role, m.role === 'owner' ? 'violet' : m.role === 'staff' ? 'blue' : 'grey')}${isEnv ? '<span class="small muted">Set on Cloudflare</span>' : ''}</div>
      </div>`;
    };

    const addForm = ctx.isOwner ? card('Add a team member', `
      <form method="post" action="/admin/team/add" class="fgrid">
        ${field('full_name', 'Name', { required: true, max: 120 })}
        ${field('email', 'Work email', { type: 'email', required: true, max: 254, hint: 'They sign in with a code sent to this address.' })}
        ${field('title', 'Job title', { max: 80, placeholder: 'e.g. Associate, Paralegal, Front desk' })}
        ${select('role', 'Role', ROLES, { value: 'staff' })}
        <div class="full btn-row"><button class="btn" type="submit">${icon('plus', 18)}Add member</button></div>
      </form>`) : '';

    const roleHelp = card('Roles', `<dl class="kv">${Object.entries(ROLES).map(([, r]) => `<dt><strong>${esc(r.label)}</strong></dt><dd class="small">${esc(r.note)}</dd>`).join('')}</dl>
      <p class="small muted" style="margin-bottom:0">Owners listed in the ADMIN_EMAILS variable on Cloudflare can never be locked out. Everything anyone does is written to the Activity log.</p>`);

    return ctx.page('Team', 'team', `
      ${pageHead('Team & settings', 'Who can use the system, and the firm details on every document')}
      ${tabs('team')}
      ${ctx.flashHtml}
      ${readOnlyNote(user.role)}
      <div class="grid grid-3">
        <div>${card('Team', `<div class="rows">${envOnly.map(e => memberRow({ email: e, full_name: e, role: 'owner', active: 1 }, true)).join('')}${rows.map(m => memberRow(m, false)).join('')}</div>`, { pad: false })}</div>
        <div>${addForm}${roleHelp}</div>
      </div>`);
  }

  if (method !== 'POST') return null;
  if (!ctx.isOwner) return ctx.redirect('/admin/team?done=forbidden');
  const form = await ctx.request.formData();
  const now = new Date().toISOString();

  if (parts[1] === 'add') {
    const email = String(form.get('email') || '').trim().toLowerCase().slice(0, 254);
    const fullName = text(form, 'full_name', 120);
    const role = pick(form, 'role', ROLES, 'staff');
    if (!fullName || !EMAIL_RE.test(email)) return ctx.redirect('/admin/team?done=invalid');
    if (envOwners.includes(email)) return ctx.redirect('/admin/team?done=member_env');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO staff (email, full_name, role, title, active, created_at, updated_at, created_by) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5, ?6)
                      ON CONFLICT(email) DO UPDATE SET full_name = ?2, role = ?3, title = ?4, active = 1, updated_at = ?5`)
        .bind(email, fullName, role, text(form, 'title', 80), now, ctx.actor),
      ctx.auditStmt('team.member_added', 'staff', email, { role }, now)
    ]);
    return ctx.redirect('/admin/team?done=member_added');
  }

  if (parts[2] === 'update') {
    const email = decodeURIComponent(parts[1] || '').toLowerCase();
    if (email === user.email) return ctx.redirect('/admin/team?done=member_self');
    if (envOwners.includes(email)) return ctx.redirect('/admin/team?done=member_env');
    const m = await env.DB.prepare('SELECT * FROM staff WHERE email = ?1').bind(email).first();
    if (!m) return ctx.notFound();
    const fullName = text(form, 'full_name', 120);
    if (!fullName) return ctx.redirect('/admin/team?done=invalid');
    const role = pick(form, 'role', ROLES, m.role);
    const active = form.get('active') === '0' ? 0 : 1;
    await env.DB.batch([
      env.DB.prepare('UPDATE staff SET full_name = ?2, title = ?3, phone = ?4, role = ?5, active = ?6, updated_at = ?7 WHERE email = ?1')
        .bind(email, fullName, text(form, 'title', 80), text(form, 'phone', 40), role, active, now),
      ctx.auditStmt(active ? 'team.member_updated' : 'team.member_deactivated', 'staff', email, { role, from: m.role, active: !!active }, now)
    ]);
    if (!active) await endSessionsFor(env, email);
    return ctx.redirect(`/admin/team?done=${active ? 'member_updated' : 'member_deactivated'}`);
  }
  return null;
}

async function settings(ctx) {
  const { env, method } = ctx;
  if (method === 'POST') {
    if (!ctx.isOwner) return ctx.redirect('/admin/settings?done=forbidden');
    const form = await ctx.request.formData();
    const now = new Date().toISOString();
    const current = await getSettings(env);
    const changed = [];
    const stmts = [];
    for (const f of SETTING_FIELDS) {
      const v = String(form.get(f.key) ?? '').trim().slice(0, f.textarea ? 600 : 200);
      if (v === String(current[f.key] ?? '')) continue;
      if (f.key === 'vat_rate' && !/^\d{1,2}(\.\d{1,2})?$/.test(v || '0')) return ctx.redirect('/admin/settings?done=invalid');
      if (/_days$/.test(f.key) && !/^\d{1,3}$/.test(v)) return ctx.redirect('/admin/settings?done=invalid');
      changed.push(f.key);
      stmts.push(env.DB.prepare('INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = ?4')
        .bind(f.key, v, now, ctx.actor));
    }
    if (!stmts.length) return ctx.redirect('/admin/settings?done=saved');
    stmts.push(ctx.auditStmt('settings.updated', 'settings', 'firm', { changed }, now));
    await env.DB.batch(stmts);
    return ctx.redirect('/admin/settings?done=settings_saved');
  }
  if (method !== 'GET') return null;
  const s = await getSettings(env);
  const groups = [...new Set(SETTING_FIELDS.map(f => f.group))];
  const disabled = ctx.isOwner ? '' : ' disabled';
  return ctx.page('Firm settings', 'team', `
    ${pageHead('Team & settings', 'Who can use the system, and the firm details on every document')}
    ${tabs('settings')}
    ${ctx.flashHtml}
    ${ctx.isOwner ? '' : `<div class="note" style="margin-bottom:16px">${icon('lock', 18)}<span>Only owners can change firm settings.</span></div>`}
    <form method="post" action="/admin/settings">
      <fieldset style="border:0;padding:0;margin:0"${disabled}>
      <div class="grid grid-2">
        ${groups.map(g => card(g, `<div class="fgrid">${SETTING_FIELDS.filter(f => f.group === g).map(f => f.textarea
          ? area(f.key, f.label, { value: s[f.key], max: 600, hint: f.hint })
          : field(f.key, f.label, { value: s[f.key], max: 200, hint: f.hint, cls: f.hint ? 'full' : '' })).join('')}</div>`)).join('')}
        ${card('Why this matters', `<p class="small" style="margin-top:0">These details appear on every quote, invoice and receipt, and on the pages clients open from their email. Keeping them here, rather than in the code, means the system can be handed to a new owner or set up for another firm without a developer.</p><p class="small muted" style="margin-bottom:0">Website emails (application confirmations, reminders) still use the details in the code; see ops/practice-system.md.</p>`)}
      </div>
      ${ctx.isOwner ? '<div class="btn-row"><button class="btn" type="submit">Save settings</button></div>' : ''}
      </fieldset>
    </form>`);
}

async function system(ctx) {
  const { env } = ctx;
  const checks = [];
  const ok = (label, good, note) => checks.push({ label, good, note });
  ok('Records database (DB)', !!env.DB, 'D1 binding to awal-cases');
  ok('Document storage (DOCS)', !!env.DOCS, 'R2 binding to awal-documents');
  ok('Email sending (BREVO_API_KEY)', !!env.BREVO_API_KEY, 'Needed for sign-in codes, invoices and the morning summary');
  ok('Daily job secret (CRON_SECRET)', !!env.CRON_SECRET, 'Must match the awal-daily Worker');
  ok('Bot check (TURNSTILE_SECRET_KEY)', !!env.TURNSTILE_SECRET_KEY, 'Protects the public forms');

  const tables = ['staff', 'settings', 'tasks', 'invoices', 'invoice_items', 'payments', 'contacts', 'correspondence', 'assets', 'firm_files'];
  let migrated = true;
  const counts = {};
  for (const t of ['clients', 'cases', 'documents', ...tables]) {
    try {
      counts[t] = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n;
    } catch (err) {
      counts[t] = null;
      if (tables.includes(t)) migrated = false;
    }
  }
  ok('Practice system tables (migration 0005)', migrated, migrated ? 'Applied' : 'Not applied: run db/migrations/0005_practice.sql on awal-cases');
  const lastRun = await env.DB.prepare("SELECT run_date, ran_at, detail FROM job_runs WHERE job = 'daily' ORDER BY run_date DESC LIMIT 1").first().catch(() => null);
  const lastAgeDays = lastRun ? Math.floor((Date.now() - new Date(lastRun.ran_at).getTime()) / 86400000) : null;
  ok('Morning job ran recently', lastRun && lastAgeDays <= 1, lastRun ? `Last run ${fmtDate(lastRun.ran_at)}` : 'Never run');

  const LABELS = { clients: 'Clients', cases: 'Matters', documents: 'Client documents', staff: 'Team members', settings: 'Settings changed', tasks: 'Tasks', invoices: 'Quotes & invoices', invoice_items: 'Invoice lines', payments: 'Payments', contacts: 'Contacts', correspondence: 'Register entries', assets: 'Office items', firm_files: 'Firm files' };
  return ctx.page('System health', 'team', `
    ${pageHead('Team & settings', 'Who can use the system, and the firm details on every document')}
    ${tabs('system')}
    <div class="grid grid-3">
      <div>${card('Checks', `<div class="rows">${checks.map(c => `<div class="row"><span class="stat-ic tone-${c.good ? 'green' : 'red'}" style="width:32px;height:32px">${icon(c.good ? 'check' : 'alert', 16)}</span><div class="row-main"><div class="row-title">${esc(c.label)}</div><div class="row-sub">${esc(c.note)}</div></div>${pill(c.good ? 'OK' : 'Needs attention', c.good ? 'green' : 'red')}</div>`).join('')}</div>`, { pad: false })}</div>
      <div>${card('What is stored', `<dl class="kv">${Object.entries(counts).map(([t, n]) => `<dt>${esc(LABELS[t] || t)}</dt><dd>${n === null ? '<span class="muted">not set up</span>' : n.toLocaleString('en-NG')}</dd>`).join('')}</dl>`)}
        ${card('Handover', `<p class="small" style="margin-top:0">How everything is wired together, and how to rebuild it, is written down in <strong>ops/README.md</strong> and <strong>ops/practice-system.md</strong> in the website's code.</p>`)}</div>
    </div>`);
}
