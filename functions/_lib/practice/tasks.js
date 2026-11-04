/**
 * Tasks and deadlines (/admin/tasks).
 *
 *   GET  /admin/tasks                  ?view=mine|open|overdue|done  ?case=<id>
 *   POST /admin/tasks/new              add a task (from this page or a matter)
 *   GET  /admin/tasks/:id              edit
 *   POST /admin/tasks/:id/update|done|reopen
 *
 * A "deadline" is a task with legal consequences if missed (a filing date,
 * a court date, a renewal); deadlines are shown in red when close.
 */
import { adminEmails } from '../admin-auth.js';
import { teamList, personName, text, pick, formDate, dueIso, lagosToday, addDays } from './core.js';
import { esc, icon, pill, field, area, select, teamSelect, caseSelect, openCases, card, hidden, dueBadge, chips, emptyState, readOnlyNote } from './ui.js';
import { pageHead, ago } from '../admin-ui.js';

const KINDS = { task: 'Task', deadline: 'Deadline (legal or filing date)' };
const PRIORITIES = { normal: 'Normal', high: 'High', low: 'Low' };

/** Only allow redirects back into the dashboard. */
export function safeBack(v, fallback = '/admin/tasks') {
  const s = String(v || '');
  return /^\/admin\/[A-Za-z0-9/_\-?=&%.]*$/.test(s) && !s.startsWith('//') ? s : fallback;
}

function withDone(path, key) {
  return `${path}${path.includes('?') ? '&' : '?'}done=${key}`;
}

export async function handle(ctx) {
  const { parts, method } = ctx;
  if (parts[0] !== 'tasks') return null;
  if (parts.length === 1 && method === 'GET') return list(ctx);
  if (parts[1] === 'new' && method === 'POST') return create(ctx);
  if (parts[1] && parts.length === 2 && method === 'GET') return edit(ctx);
  if (parts[1] && ['update', 'done', 'reopen'].includes(parts[2]) && method === 'POST') return change(ctx, parts[2]);
  return null;
}

export function taskRow(t, team, { canWrite, back, showCase = true }) {
  const done = t.status === 'done';
  const due = t.due_at ? t.due_at.slice(0, 10) : null;
  const sub = [
    t.kind === 'deadline' ? 'Deadline' : null,
    showCase && t.reference ? `${t.reference}${t.full_name ? ` · ${t.full_name}` : ''}` : null,
    personName(team, t.assigned_to) || 'Unassigned',
    done && t.completed_at ? `done ${ago(t.completed_at)}` : null
  ].filter(Boolean).join(' · ');
  return `<div class="task-row ${done ? 'done' : ''}">
    ${canWrite ? `<form method="post" action="/admin/tasks/${esc(t.id)}/${done ? 'reopen' : 'done'}">${hidden('back', back)}<button class="tick ${done ? 'done' : ''}" type="submit" aria-label="${done ? 'Reopen task' : 'Mark task done'}">${icon('check', 14)}</button></form>` : ''}
    <span class="prio ${esc(t.priority)}" title="${esc(PRIORITIES[t.priority] || '')} priority"></span>
    <a href="/admin/tasks/${esc(t.id)}" class="row-main" style="text-decoration:none;color:inherit">
      <div class="row-title">${t.kind === 'deadline' ? `<span style="color:var(--red)">${icon('alert', 14).replace('class="ic"', 'class="ic" style="display:inline-block;vertical-align:-2px;margin-right:4px"')}</span>` : ''}${esc(t.title)}</div>
      <div class="row-sub">${esc(sub)}</div>
    </a>
    ${!done && due ? dueBadge(due) : ''}
  </div>`;
}

async function list(ctx) {
  const { env, url, user } = ctx;
  const team = await teamList(env, adminEmails(env));
  const caseId = url.searchParams.get('case');
  const views = {
    mine: { label: 'Mine', sql: "t.status = 'open' AND t.assigned_to = ?1" },
    open: { label: 'All open', sql: "t.status = 'open'" },
    overdue: { label: 'Overdue', sql: "t.status = 'open' AND t.due_at < ?2" },
    week: { label: 'Next 7 days', sql: "t.status = 'open' AND t.due_at >= ?2 AND t.due_at < ?3" },
    deadlines: { label: 'Deadlines', sql: "t.status = 'open' AND t.kind = 'deadline'" },
    done: { label: 'Done', sql: "t.status = 'done'" }
  };
  const view = views[url.searchParams.get('view')] ? url.searchParams.get('view') : (caseId ? 'open' : 'mine');
  const today = `${lagosToday()}T00:00:00.000Z`;
  const weekEnd = `${addDays(lagosToday(), 8)}T00:00:00.000Z`;
  const caseSql = caseId ? ' AND t.case_id = ?4' : '';
  const args = [user.email, today, weekEnd, ...(caseId ? [caseId] : [])];
  const [rows, counts] = await env.DB.batch([
    env.DB.prepare(`SELECT t.*, c.reference, cl.full_name FROM tasks t LEFT JOIN cases c ON c.id = t.case_id LEFT JOIN clients cl ON cl.id = c.client_id
                    WHERE ${views[view].sql}${caseSql}
                    ORDER BY ${view === 'done' ? 't.completed_at DESC' : "t.due_at IS NULL, t.due_at, CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END"} LIMIT 300`).bind(...args),
    env.DB.prepare(`SELECT ${Object.entries(views).map(([k, v]) => `SUM(CASE WHEN ${v.sql} THEN 1 ELSE 0 END) AS "${k}"`).join(', ')} FROM tasks t WHERE 1 = 1${caseSql}`).bind(...args)
  ]);
  const n = (counts.results || [])[0] || {};
  const c = caseId ? await env.DB.prepare('SELECT c.id, c.reference, cl.full_name FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE c.id = ?1').bind(caseId).first() : null;
  const base = `/admin/tasks?${caseId ? `case=${encodeURIComponent(caseId)}&` : ''}`;
  const back = `${base}view=${view}`;
  const items = rows.results || [];
  const cases = ctx.canWrite ? await openCases(env, caseId) : [];

  const addCard = ctx.canWrite ? card('Add a task', `
    <form method="post" action="/admin/tasks/new" class="fgrid">
      ${hidden('back', back)}
      ${field('title', 'What needs doing', { required: true, max: 200, cls: 'full', placeholder: 'e.g. File annual returns for Ade Ventures Ltd' })}
      ${field('due', 'Due', { type: 'date', value: lagosToday() })}
      ${select('kind', 'Type', KINDS, { value: 'task' })}
      ${teamSelect(team, 'assigned_to', 'For', user.email, { cls: 'full' })}
      ${caseSelect(cases, 'case_id', 'Matter', caseId, { cls: 'full' })}
      ${select('priority', 'Priority', PRIORITIES, { value: 'normal' })}
      <div class="btn-row" style="align-self:end"><button class="btn block" type="submit">${icon('plus', 18)}Add task</button></div>
    </form>`) : '';

  return ctx.page('Tasks', 'tasks', `
    ${pageHead('Tasks & deadlines', c ? `For <a href="/admin/case/${esc(c.id)}">${esc(c.reference)} · ${esc(c.full_name)}</a>` : 'Everything the team has to do, and every date that must not be missed')}
    ${ctx.flashHtml}
    ${readOnlyNote(user.role)}
    ${chips(Object.entries(views).map(([k, v]) => ({ key: k, label: v.label, n: n[k] || 0, href: `${base}view=${k}` })), view)}
    <div class="grid grid-3">
      <div class="card">${items.length ? `<div class="rows">${items.map(t => taskRow(t, team, { canWrite: ctx.canWrite, back, showCase: !caseId })).join('')}</div>` : `<div class="card-body">${emptyState('tasks', view === 'mine' ? 'Nothing on your list' : 'No tasks here', view === 'mine' ? 'Tasks assigned to you appear here.' : '')}</div>`}</div>
      <div>${addCard}
        <div class="note">${icon('bell', 18)}<span>Overdue tasks and deadlines due in the next three days are in the 8am summary email.</span></div>
      </div>
    </div>`);
}

function readTask(form, team) {
  return {
    title: text(form, 'title', 200),
    detail: text(form, 'detail', 2000),
    kind: pick(form, 'kind', KINDS, 'task'),
    priority: pick(form, 'priority', PRIORITIES, 'normal'),
    due: dueIso(formDate(form, 'due')),
    caseId: String(form.get('case_id') || '') || null,
    assigned: team.some(t => t.email === form.get('assigned_to')) ? String(form.get('assigned_to')) : null
  };
}

async function create(ctx) {
  const { env } = ctx;
  const form = await ctx.request.formData();
  const back = safeBack(form.get('back'));
  if (!ctx.canWrite) return ctx.redirect(withDone(back, 'forbidden'));
  const team = await teamList(env, adminEmails(env));
  const t = readTask(form, team);
  if (!t.title) return ctx.redirect(withDone(back, 'invalid'));
  if (t.caseId && !(await env.DB.prepare('SELECT id FROM cases WHERE id = ?1').bind(t.caseId).first())) t.caseId = null;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO tasks (id, title, detail, kind, priority, due_at, case_id, assigned_to, status, created_at, created_by)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'open', ?9, ?10)`)
      .bind(id, t.title, t.detail, t.kind, t.priority, t.due, t.caseId, t.assigned, now, ctx.actor),
    ctx.auditStmt('task.created', 'task', id, { title: t.title, case: t.caseId, kind: t.kind }, now)
  ]);
  return ctx.redirect(withDone(back, 'task_saved'));
}

async function edit(ctx) {
  const { env, parts } = ctx;
  const t = await env.DB.prepare('SELECT t.*, c.reference, cl.full_name FROM tasks t LEFT JOIN cases c ON c.id = t.case_id LEFT JOIN clients cl ON cl.id = c.client_id WHERE t.id = ?1').bind(parts[1]).first();
  if (!t) return ctx.notFound();
  const team = await teamList(env, adminEmails(env));
  const cases = await openCases(env, t.case_id);
  const ro = !ctx.canWrite;
  return ctx.page(t.title, 'tasks', `
    ${pageHead(t.title, `${t.status === 'done' ? `Done ${esc(ago(t.completed_at))} by ${esc(personName(team, (t.completed_by || '').replace(/^admin:/, '')) || 'someone')}` : (t.due_at ? `Due ${esc(t.due_at.slice(0, 10))}` : 'No due date')}`, '', { href: '/admin/tasks', label: 'Tasks' })}
    ${ctx.flashHtml}
    <div class="grid grid-3">
      <div>${card('Details', `
        <form method="post" action="/admin/tasks/${esc(t.id)}/update" class="fgrid"><fieldset style="display:contents"${ro ? ' disabled' : ''}>
          ${field('title', 'What needs doing', { required: true, max: 200, cls: 'full', value: t.title })}
          ${area('detail', 'Notes', { value: t.detail, max: 2000 })}
          ${field('due', 'Due', { type: 'date', value: t.due_at ? t.due_at.slice(0, 10) : '' })}
          ${select('kind', 'Type', KINDS, { value: t.kind })}
          ${teamSelect(team, 'assigned_to', 'For', t.assigned_to)}
          ${select('priority', 'Priority', PRIORITIES, { value: t.priority })}
          ${caseSelect(cases, 'case_id', 'Matter', t.case_id, { cls: 'full' })}
          ${ro ? '' : '<div class="full btn-row"><button class="btn" type="submit">Save</button></div>'}
        </fieldset></form>`)}</div>
      <div>${card('Status', `
        <p style="margin-top:0">${t.status === 'done' ? pill('Done', 'green') : (t.due_at ? dueBadge(t.due_at.slice(0, 10)) : pill('Open', 'blue'))}</p>
        ${t.reference ? `<p class="small"><a href="/admin/case/${esc(t.case_id)}">${esc(t.reference)} · ${esc(t.full_name || '')}</a></p>` : ''}
        ${ro ? '' : `<form method="post" action="/admin/tasks/${esc(t.id)}/${t.status === 'done' ? 'reopen' : 'done'}">${hidden('back', `/admin/tasks/${t.id}`)}<button class="btn ${t.status === 'done' ? 'ghost' : ''} block" type="submit">${icon('check', 18)}${t.status === 'done' ? 'Reopen' : 'Mark done'}</button></form>`}
        <p class="small muted" style="margin-bottom:0">Added ${esc(ago(t.created_at))} by ${esc(personName(team, t.created_by.replace(/^admin:/, '')) || t.created_by)}</p>`)}</div>
    </div>`);
}

async function change(ctx, action) {
  const { env, parts } = ctx;
  const t = await env.DB.prepare('SELECT id, title, status FROM tasks WHERE id = ?1').bind(parts[1]).first();
  if (!t) return ctx.notFound();
  const form = await ctx.request.formData();
  const back = safeBack(form.get('back'), `/admin/tasks/${t.id}`);
  if (!ctx.canWrite) return ctx.redirect(withDone(back, 'forbidden'));
  const now = new Date().toISOString();
  if (action === 'done' || action === 'reopen') {
    const done = action === 'done';
    await env.DB.batch([
      env.DB.prepare('UPDATE tasks SET status = ?2, completed_at = ?3, completed_by = ?4 WHERE id = ?1')
        .bind(t.id, done ? 'done' : 'open', done ? now : null, done ? ctx.actor : null),
      ctx.auditStmt(done ? 'task.done' : 'task.reopened', 'task', t.id, { title: t.title }, now)
    ]);
    return ctx.redirect(withDone(back, done ? 'task_done' : 'task_reopened'));
  }
  const team = await teamList(env, adminEmails(env));
  const v = readTask(form, team);
  if (!v.title) return ctx.redirect(withDone(back, 'invalid'));
  await env.DB.batch([
    env.DB.prepare('UPDATE tasks SET title = ?2, detail = ?3, kind = ?4, priority = ?5, due_at = ?6, case_id = ?7, assigned_to = ?8 WHERE id = ?1')
      .bind(t.id, v.title, v.detail, v.kind, v.priority, v.due, v.caseId, v.assigned),
    ctx.auditStmt('task.updated', 'task', t.id, { title: v.title }, now)
  ]);
  return ctx.redirect(withDone(`/admin/tasks/${t.id}`, 'task_saved'));
}
