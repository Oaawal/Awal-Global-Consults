/**
 * Matters opened by staff, assignment, and staff document uploads.
 *
 *   GET  /admin/matters/new            open a matter for a walk-in, WhatsApp, phone or referral client
 *   POST /admin/matters/new
 *   POST /admin/case/:id/assign        set who is responsible
 *   POST /admin/case/:id/upload        add a document to the matter
 *   POST /admin/case/:id/doc/:doc/remove   take a document off the list (kept in storage until erasure)
 *
 * caseSidePanel() adds tasks, billing and register entries to the matter page.
 */
import { APPLICATION_STATUSES, ENQUIRY_STATUSES } from '../cases.js';
import { nextNumber, text, pick, formDate, dueIso, allowedUpload, cleanFileName, naira, teamList, personName, lagosToday } from './core.js';
import { esc, icon, pill, field, area, select, teamSelect, card, hidden, fileInput, dueBadge, emptyState } from './ui.js';
import { adminEmails } from '../admin-auth.js';
import { pageHead, statusPill } from '../admin-ui.js';

export const SOURCES = {
  walk_in: 'Walk-in at the office',
  whatsapp: 'WhatsApp',
  phone: 'Phone call',
  email: 'Email',
  referral: 'Referral',
  existing: 'Existing client',
  website: 'Website form',
  other: 'Other'
};

export const COMMON_SERVICES = [
  'CAC Business Name Registration', 'CAC Company Incorporation (Ltd)', 'Incorporated Trustees (NGO / Church)',
  'Company Limited by Guarantee', 'CAC Annual Returns', 'CAC Post-incorporation Changes', 'Trademark Registration',
  'Trademark Renewal', 'SCUML Registration', 'TIN and Tax Clearance', 'Tax Filing and Advisory', 'NEPC Export Licence',
  'International Passport', 'NIN Enrolment / Correction', 'CERPAC', 'Expatriate Quota', 'Student Visa Advisory',
  'Property Documentation Check', 'Contract Drafting / Review', 'Legal Opinion', 'Demand Letter', 'Litigation',
  'Fintech / CBN Licensing Advisory', 'NDPA Data Protection Compliance', 'GRC Gap Assessment', 'Cybersecurity Support',
  'KYC / AML Compliance', 'Business Advisory'
];

const DOC_LABELS = ['Engagement letter', 'Signed engagement letter', 'ID document', 'Proof of address', 'Passport photograph',
  'CAC certificate', 'CAC status report', 'MEMART', 'Filing receipt', 'Agency acknowledgement', 'Court process',
  'Correspondence', 'Draft', 'Final document', 'Invoice / receipt', 'Other'];

export async function handle(ctx) {
  const { parts, method } = ctx;
  if (parts[0] === 'matters' && parts[1] === 'new') return method === 'POST' ? createMatter(ctx) : newMatterPage(ctx);
  if (parts[0] === 'case' && parts[1] && method === 'POST') {
    if (parts[2] === 'assign' && parts.length === 3) return assign(ctx);
    if (parts[2] === 'upload' && parts.length === 3) return upload(ctx);
    if (parts[2] === 'doc' && parts[3] && parts[4] === 'remove') return removeDoc(ctx);
  }
  return null;
}

async function newMatterPage(ctx, { error = null, values = {} } = {}) {
  const { env, url } = ctx;
  if (!ctx.canWrite) return ctx.redirect('/admin/cases?done=forbidden');
  const team = await teamList(env, adminEmails(env));
  const clients = (await env.DB.prepare(
    "SELECT id, full_name, email, phone FROM clients WHERE anonymised_at IS NULL ORDER BY updated_at DESC LIMIT 500"
  ).all()).results || [];
  const preset = values.client_id || url.searchParams.get('client') || '';
  const v = (k, d = '') => values[k] ?? d;

  return ctx.page('Open a matter', 'cases', `
    ${pageHead('Open a matter', 'For clients who came in person, on WhatsApp, by phone or by referral. Website submissions open themselves.', '', { href: '/admin/cases', label: 'Matters' })}
    ${error ? `<div class="flash err">${icon('alert', 18)}<span>${esc(error)}</span></div>` : ''}
    <form method="post" action="/admin/matters/new">
      <div class="grid grid-3">
        <div>
          ${card('Client', `
            ${select('client_id', 'Existing client', clients.map(c => [c.id, `${c.full_name}${c.email ? ` · ${c.email}` : (c.phone ? ` · ${c.phone}` : '')}`]), { blank: '— New client (fill in below) —', value: preset })}
            <p class="small muted" style="margin:14px 0 0">Or a new client:</p>
            <div class="fgrid">
              ${field('full_name', 'Full name or company', { value: v('full_name'), max: 120 })}
              ${field('phone', 'Phone / WhatsApp', { value: v('phone'), max: 40, inputmode: 'tel' })}
              ${field('email', 'Email', { type: 'email', value: v('email'), max: 254, cls: 'full' })}
            </div>`)}
          ${card('Matter', `
            <div class="fgrid">
              ${field('services', 'What the matter is about', { required: true, value: v('services'), max: 200, list: 'services-list', cls: 'full', placeholder: 'e.g. CAC Company Incorporation (Ltd)' })}
              <datalist id="services-list">${COMMON_SERVICES.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
              ${select('kind', 'Type', [['application', 'Matter (work for a client)'], ['enquiry', 'Enquiry only (no engagement yet)']], { value: v('kind', 'application') })}
              ${select('status', 'Starting stage', APPLICATION_STATUSES.filter(s => !['closed', 'cancelled'].includes(s.key)).map(s => [s.key, s.label]), { value: v('status', 'new'), hint: 'Enquiries always start as New.' })}
              ${select('source', 'How they came to us', SOURCES, { value: v('source', 'walk_in') })}
              ${teamSelect(team, 'assigned_to', 'Responsible', v('assigned_to', ctx.user.email))}
              ${area('details', 'Instructions and notes', { value: v('details'), placeholder: 'What the client wants, key facts, agreed fee, anything promised.' })}
            </div>`)}
        </div>
        <div>
          ${card('First steps', `
            <div class="fgrid">
              ${field('task', 'First task (optional)', { value: v('task'), max: 200, cls: 'full', placeholder: 'e.g. Run CAC name search' })}
              ${field('task_due', 'Task due', { type: 'date', value: v('task_due', lagosToday()), cls: 'full' })}
            </div>
            <label class="check"><input type="checkbox" name="consent" value="1"${values.consent ? ' checked' : ''}> The client agreed to us holding their details and documents for this matter (privacy policy explained).</label>
            <div class="btn-row"><button class="btn block" type="submit">${icon('plus', 18)}Open matter</button></div>`)}
          <div class="note">${icon('shield', 18)}<span>Matters opened here follow the same record-keeping rules as website applications: kept 6 years after closing, every view logged.</span></div>
        </div>
      </div>
    </form>`);
}

async function createMatter(ctx) {
  const { env, request } = ctx;
  if (!ctx.canWrite) return ctx.redirect('/admin/cases?done=forbidden');
  const form = await request.formData();
  const values = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const now = new Date().toISOString();
  const services = text(form, 'services', 200);
  const kind = form.get('kind') === 'enquiry' ? 'enquiry' : 'application';
  const statusList = kind === 'enquiry' ? ENQUIRY_STATUSES : APPLICATION_STATUSES;
  const status = kind === 'enquiry' ? 'new' : (statusList.some(s => s.key === form.get('status') && !['closed', 'cancelled'].includes(s.key)) ? String(form.get('status')) : 'new');
  const source = pick(form, 'source', SOURCES, 'other');
  const team = await teamList(env, adminEmails(env));
  const assigned = team.some(t => t.email === form.get('assigned_to')) ? String(form.get('assigned_to')) : null;
  const details = text(form, 'details', 4000);
  if (!services) return newMatterPage(ctx, { error: 'Say what the matter is about.', values });

  let clientId = String(form.get('client_id') || '');
  let clientName;
  const stmts = [];
  if (clientId) {
    const existing = await env.DB.prepare('SELECT id, full_name FROM clients WHERE id = ?1 AND anonymised_at IS NULL').bind(clientId).first();
    if (!existing) return newMatterPage(ctx, { error: 'That client could not be found.', values });
    clientName = existing.full_name;
  } else {
    const fullName = text(form, 'full_name', 120);
    const email = (text(form, 'email', 254) || '').toLowerCase() || null;
    const phone = text(form, 'phone', 40);
    if (!fullName) return newMatterPage(ctx, { error: 'Choose an existing client, or enter the new client\'s name.', values });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return newMatterPage(ctx, { error: 'That email address does not look right.', values });
    const match = email ? await env.DB.prepare('SELECT id FROM clients WHERE email = ?1 AND anonymised_at IS NULL LIMIT 1').bind(email).first() : null;
    if (match) {
      clientId = match.id;
      stmts.push(env.DB.prepare('UPDATE clients SET phone = COALESCE(?2, phone), updated_at = ?3 WHERE id = ?1').bind(clientId, phone, now));
    } else {
      clientId = crypto.randomUUID();
      stmts.push(env.DB.prepare('INSERT INTO clients (id, full_name, email, phone, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)').bind(clientId, fullName, email, phone, now));
    }
    clientName = fullName;
  }

  const reference = await nextNumber(env, kind === 'application' ? 'AGC' : 'ENQ');
  const caseId = crypto.randomUUID();
  const fields = { 'Opened by': ctx.user.email, 'How they came to us': SOURCES[source] };
  if (details) fields['Instructions and notes'] = details;
  const consent = form.get('consent') === '1' ? 1 : 0;
  const retainUntil = kind === 'enquiry' ? new Date(new Date(now).setUTCMonth(new Date(now).getUTCMonth() + 12)).toISOString() : null;

  stmts.push(env.DB.prepare(
    `INSERT INTO cases (id, reference, client_id, kind, services, status, form_data, consent_accuracy, consent_processing, source_page,
                        created_at, updated_at, status_changed_at, retention_class, retain_until, assigned_to, source)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, NULL, ?9, ?9, ?9, ?4, ?10, ?11, ?12)`
  ).bind(caseId, reference, clientId, kind, services, status, JSON.stringify(fields), consent, now, retainUntil, assigned, source));
  stmts.push(env.DB.prepare("INSERT INTO case_events (case_id, event, to_status, note, actor, created_at) VALUES (?1, 'created', ?2, ?3, ?4, ?5)")
    .bind(caseId, status, `Opened by ${ctx.user.email} (${SOURCES[source]})`, ctx.actor, now));
  stmts.push(ctx.auditStmt('case.created', 'case', caseId, { reference, kind, source, by: 'staff' }, now));

  const taskTitle = text(form, 'task', 200);
  if (taskTitle) {
    stmts.push(env.DB.prepare(`INSERT INTO tasks (id, title, kind, priority, due_at, case_id, assigned_to, status, created_at, created_by)
                               VALUES (?1, ?2, 'task', 'normal', ?3, ?4, ?5, 'open', ?6, ?7)`)
      .bind(crypto.randomUUID(), taskTitle, dueIso(formDate(form, 'task_due')), caseId, assigned, now, ctx.actor));
  }
  await env.DB.batch(stmts);
  return ctx.redirect(`/admin/case/${caseId}?done=matter_created`);
}

async function loadCase(env, id) {
  return env.DB.prepare('SELECT id, reference, purged_at, assigned_to FROM cases WHERE id = ?1').bind(id).first();
}

async function assign(ctx) {
  const { env, parts } = ctx;
  const c = await loadCase(env, parts[1]);
  if (!c) return ctx.notFound();
  if (!ctx.canWrite || c.purged_at) return ctx.redirect(`/admin/case/${c.id}?done=forbidden`);
  const form = await ctx.request.formData();
  const team = await teamList(env, adminEmails(env));
  const to = team.some(t => t.email === form.get('assigned_to')) ? String(form.get('assigned_to')) : null;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE cases SET assigned_to = ?2, updated_at = ?3 WHERE id = ?1').bind(c.id, to, now),
    env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'assigned', ?2, ?3, ?4)")
      .bind(c.id, to ? `Assigned to ${personName(team, to)}` : 'Unassigned', ctx.actor, now),
    ctx.auditStmt('case.assigned', 'case', c.id, { reference: c.reference, to }, now)
  ]);
  return ctx.redirect(`/admin/case/${c.id}?done=assigned`);
}

async function upload(ctx) {
  const { env, parts } = ctx;
  const c = await loadCase(env, parts[1]);
  if (!c) return ctx.notFound();
  const back = key => ctx.redirect(`/admin/case/${c.id}?tab=documents&done=${key}`);
  if (!ctx.canWrite || c.purged_at) return back('forbidden');
  const form = await ctx.request.formData();
  const file = form.get('file');
  if (allowedUpload(file)) return back('upload_failed');
  const docId = crypto.randomUUID();
  const key = `case/${c.id}/${docId}`;
  const name = cleanFileName(file.name);
  const label = text(form, 'label', 80);
  const now = new Date().toISOString();
  await env.DOCS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'application/octet-stream' }, customMetadata: { caseId: c.id, docId, fileName: name } });
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO documents (id, case_id, file_name, content_type, size_bytes, storage_key, uploaded_at, uploaded_by, label) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
        .bind(docId, c.id, name, file.type || null, file.size, key, now, ctx.user.email, label),
      env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'document_added', ?2, ?3, ?4)")
        .bind(c.id, `${label ? `${label}: ` : ''}${name}`, ctx.actor, now),
      ctx.auditStmt('document.uploaded', 'case', c.id, { reference: c.reference, file: name, label }, now)
    ]);
  } catch (err) {
    await env.DOCS.delete(key).catch(() => {});
    throw err;
  }
  return back('uploaded');
}

async function removeDoc(ctx) {
  const { env, parts } = ctx;
  const c = await loadCase(env, parts[1]);
  if (!c) return ctx.notFound();
  const back = key => ctx.redirect(`/admin/case/${c.id}?tab=documents&done=${key}`);
  if (!ctx.canWrite || c.purged_at) return back('forbidden');
  const d = await env.DB.prepare('SELECT id, file_name FROM documents WHERE id = ?1 AND case_id = ?2 AND deleted_at IS NULL').bind(parts[3], c.id).first();
  if (!d) return back('unchanged');
  const now = new Date().toISOString();
  // Only marked as removed: the file stays in storage until the case is erased, so a slip of the finger loses nothing
  await env.DB.batch([
    env.DB.prepare('UPDATE documents SET deleted_at = ?2 WHERE id = ?1').bind(d.id, now),
    env.DB.prepare("INSERT INTO case_events (case_id, event, note, actor, created_at) VALUES (?1, 'document_removed', ?2, ?3, ?4)").bind(c.id, d.file_name, ctx.actor, now),
    ctx.auditStmt('document.removed', 'case', c.id, { reference: c.reference, file: d.file_name }, now)
  ]);
  return back('file_removed');
}

/** Upload form shown on the matter's Documents tab. */
export function uploadForm(c) {
  return card('Add a document', `
    <form method="post" action="/admin/case/${esc(c.id)}/upload" enctype="multipart/form-data" class="fgrid">
      ${fileInput('file', 'File', { required: true })}
      ${field('label', 'What it is', { list: 'doc-labels', max: 80, cls: 'full', placeholder: 'e.g. Signed engagement letter' })}
      <datalist id="doc-labels">${DOC_LABELS.map(l => `<option value="${esc(l)}">`).join('')}</datalist>
      <div class="full btn-row"><button class="btn" type="submit">${icon('upload', 18)}Upload</button></div>
    </form>`);
}

/** Right-hand panel on the matter page: responsible person, tasks, billing, register. */
export async function caseSidePanel(ctx, c) {
  const { env } = ctx;
  if (c.purged_at) return '';
  const team = await teamList(env, adminEmails(env));
  const [tasks, bills, corr] = await env.DB.batch([
    env.DB.prepare("SELECT id, title, due_at, status, assigned_to, priority FROM tasks WHERE case_id = ?1 ORDER BY status = 'done', due_at IS NULL, due_at LIMIT 20").bind(c.id),
    env.DB.prepare('SELECT id, number, kind, status, total_kobo, paid_kobo, due_date FROM invoices WHERE case_id = ?1 ORDER BY created_at DESC').bind(c.id),
    env.DB.prepare('SELECT id, number, direction, subject, served_on, response_due, status FROM correspondence WHERE case_id = ?1 ORDER BY served_on DESC LIMIT 10').bind(c.id)
  ]);
  const taskRows = tasks.results || [];
  const billRows = bills.results || [];
  const corrRows = corr.results || [];
  const w = ctx.canWrite;

  const assignCard = card('Responsible', w ? `
    <form method="post" action="/admin/case/${esc(c.id)}/assign" style="display:flex;gap:8px;align-items:flex-end">
      <div style="flex:1">${teamSelect(team, 'assigned_to', 'Person handling this matter', c.assigned_to)}</div>
      <button class="btn ghost" type="submit">Save</button>
    </form>` : `<p style="margin:0">${esc(personName(team, c.assigned_to) || 'Nobody yet')}</p>`);

  const taskList = taskRows.length ? `<div class="rows">${taskRows.map(t => `
    <div class="task-row ${t.status === 'done' ? 'done' : ''}">
      ${w ? `<form method="post" action="/admin/tasks/${esc(t.id)}/${t.status === 'done' ? 'reopen' : 'done'}">${hidden('back', `/admin/case/${c.id}`)}<button class="tick ${t.status === 'done' ? 'done' : ''}" type="submit" aria-label="${t.status === 'done' ? 'Reopen' : 'Mark done'}">${icon('check', 14)}</button></form>` : ''}
      <div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-sub">${esc(personName(team, t.assigned_to) || 'Unassigned')}</div></div>
      ${t.status === 'open' && t.due_at ? dueBadge(t.due_at.slice(0, 10)) : ''}
    </div>`).join('')}</div>` : `<div class="card-body" style="padding-top:6px">${emptyState('tasks', 'No tasks for this matter')}</div>`;
  const quickTask = w ? `<div class="card-body" style="border-top:1px solid var(--line-2)"><form method="post" action="/admin/tasks/new" style="display:flex;gap:8px;flex-wrap:wrap">
      ${hidden('case_id', c.id)}${hidden('back', `/admin/case/${c.id}`)}${hidden('assigned_to', c.assigned_to || ctx.user.email)}
      <input name="title" required maxlength="200" placeholder="Add a task" style="flex:2;min-width:150px" aria-label="Task">
      <input name="due" type="date" style="flex:1;min-width:130px" aria-label="Due date">
      <button class="btn ghost" type="submit">${icon('plus', 16)}Add</button></form></div>` : '';

  const billList = billRows.length ? `<div class="rows">${billRows.map(b => {
    const balance = b.total_kobo - b.paid_kobo;
    const tone = b.status === 'void' ? 'grey' : b.kind === 'quote' ? (b.status === 'accepted' ? 'green' : 'blue') : b.status === 'draft' ? 'grey' : balance <= 0 ? 'green' : 'amber';
    const label = b.status === 'void' ? 'Void' : b.status === 'draft' ? 'Draft' : b.kind === 'quote' ? (b.status === 'accepted' ? 'Accepted' : 'Quote') : balance <= 0 ? 'Paid' : (b.paid_kobo ? 'Part paid' : 'Unpaid');
    return `<a class="row" href="/admin/billing/${esc(b.id)}"><div class="row-main"><div class="row-title">${esc(b.number)}</div><div class="row-sub">${esc(naira(b.total_kobo))}${b.kind === 'invoice' && b.status === 'issued' && balance > 0 ? ` · ${esc(naira(balance))} due` : ''}</div></div>${pill(label, tone)}</a>`;
  }).join('')}</div>` : `<div class="card-body" style="padding-top:6px">${emptyState('billing', 'Nothing billed yet')}</div>`;
  const billActions = w ? `<div class="card-body" style="border-top:1px solid var(--line-2);display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn ghost sm" href="/admin/billing/new?kind=quote&case=${esc(c.id)}">${icon('plus', 16)}Quote</a>
      <a class="btn ghost sm" href="/admin/billing/new?kind=invoice&case=${esc(c.id)}">${icon('plus', 16)}Invoice</a></div>` : '';

  const corrList = corrRows.length ? `<div class="rows">${corrRows.map(r => `<a class="row" href="/admin/register/${esc(r.id)}"><span class="dir ${r.direction}">${icon(r.direction === 'in' ? 'arrowIn' : 'arrowOut', 15)}</span><div class="row-main"><div class="row-title">${esc(r.subject)}</div><div class="row-sub">${esc(r.number)}</div></div>${r.status === 'open' && r.response_due ? dueBadge(r.response_due) : ''}</a>`).join('')}</div>` : '';

  return `${assignCard}
    <div class="card"><div class="card-head"><h2>Tasks</h2><a href="/admin/tasks?case=${esc(c.id)}">All</a></div>${taskList}${quickTask}</div>
    <div class="card"><div class="card-head"><h2>Billing</h2><a href="/admin/billing?client=${esc(c.client_id)}">Client account</a></div>${billList}${billActions}</div>
    ${corrList || w ? `<div class="card"><div class="card-head"><h2>Register</h2>${w ? `<a href="/admin/register/new?case=${esc(c.id)}">Log an entry</a>` : ''}</div>${corrList || `<div class="card-body" style="padding-top:6px">${emptyState('register', 'No letters or processes logged')}</div>`}</div>` : ''}`;
}
