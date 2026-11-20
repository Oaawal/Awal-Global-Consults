/**
 * Mailbox pages of the dashboard (/admin/mail). See mail.js for how mail is received,
 * checked and sent.
 */
import { esc, fmtDate, fmtSize, ago, icon, pill, avatar, emptyState, flashHtml, shell, pageHead } from './admin-ui.js';
import { MAIL_FOLDERS, DEFAULT_SIGNATURE, mailFrom, TRASH_DAYS } from './mail.js';

export const MAIL_FLASH = {
  mail_sent: ['ok', 'Email sent.'],
  mail_failed: ['err', 'The email could not be sent. Nothing was lost: your message is still below. Try again in a minute.'],
  mail_limit: ['err', 'Sending limit reached for this hour. This protects your domain if a login is ever misused. Try again later.'],
  mail_moved: ['ok', 'Done.'],
  mail_linked: ['ok', 'Linked to the case.'],
  mail_saved_doc: ['ok', 'Attachment saved to the case documents.'],
  mail_doc_bad: ['err', 'That attachment cannot be added to a case: only genuine PDF, JPG or PNG files up to 7MB.'],
  mail_not_set_up: ['err', 'The mailbox is not set up yet.']
};
const parse = s => { try { return JSON.parse(s || 'null'); } catch (e) { return null; } };
const who = r => r.direction === 'out' ? `To: ${r.to_addrs}` : (r.from_name || r.from_addr);

function folderTabs(folder, counts) {
  return `<div class="tabs mail-tabs">${Object.entries(MAIL_FOLDERS).map(([k, label]) =>
    `<a href="/admin/mail?f=${k}" class="${k === folder ? 'on' : ''}">${label}${counts[k] ? ` <span class="count-in">${counts[k]}</span>` : ''}</a>`).join('')}</div>`;
}

export function mailSetupPage({ admin, badges }) {
  return shell({ title: 'Mail', active: 'mail', admin, badges, body: `${pageHead('Mail', 'info@awalglobal.com.ng in your dashboard')}
    <div class="card"><div class="card-body">${emptyState('mail', 'The mailbox is not set up yet', 'The mail tables need to be added to the database, and the awal-mail Worker connected to info@. See ops/RUNBOOK.md, "Dashboard mailbox".')}</div></div>` });
}

export function mailListPage({ admin, badges, folder, rows, q, counts, flash, before }) {
  const list = rows.length ? `<div class="rows">${rows.map(r => {
    const warn = parse(r.warnings) || [];
    const danger = warn.some(w => w.level === 'danger'), caution = !danger && warn.length;
    const unread = r.direction === 'in' && !r.read_at;
    return `<a class="row mail-row${unread ? ' unread' : ''}" href="/admin/mail/${esc(r.id)}">${avatar(r.direction === 'out' ? r.to_addrs : (r.from_name || r.from_addr))}
      <div class="row-main"><div class="row-title">${unread ? '<span class="dot" aria-label="Unread"></span>' : ''}${esc(who(r))}${r.thread_count > 1 ? ` <span class="muted small">(${r.thread_count})</span>` : ''}</div>
      <div class="row-sub"><strong>${esc(r.subject || '(no subject)')}</strong>${r.snippet ? ` · ${esc(r.snippet)}` : ''}</div></div>
      <div class="row-side"><span class="small muted">${esc(ago(r.received_at))}</span>
        <span>${danger ? pill('Warning', 'red') : caution ? pill('Check', 'amber') : ''}${r.attachments ? icon('doc', 15) : ''}${r.starred ? '★' : ''}${r.client_id ? pill('Client', 'blue') : ''}</span></div></a>`;
  }).join('')}</div>${rows.length >= 50 ? `<div class="card-body"><a class="btn ghost sm" href="/admin/mail?f=${esc(folder)}${q ? `&q=${encodeURIComponent(q)}` : ''}&before=${encodeURIComponent(rows[rows.length - 1].received_at)}">Older</a></div>` : ''}`
    : `<div class="card-body">${emptyState('mail', q ? 'No emails match your search' : folder === 'inbox' ? 'No emails yet' : `Nothing in ${MAIL_FOLDERS[folder]}`, folder === 'trash' ? `Emails in Trash are deleted for good after ${TRASH_DAYS} days.` : '')}</div>`;
  return shell({ title: 'Mail', active: 'mail', admin, badges, body: `
    ${pageHead('Mail', `${esc(mailFrom({}).email)} · ${counts.unread ? `${counts.unread} unread` : 'all read'}`, `<a class="btn sm" href="/admin/mail/new">${icon('plus', 16)}New email</a>`)}
    ${flashHtml(flash)}
    ${folderTabs(folder, { inbox: counts.unread, spam: counts.spam })}
    <form class="toolbar" method="get" action="/admin/mail"><input type="hidden" name="f" value="${esc(folder)}">
      <div class="search">${icon('search', 18)}<input name="q" type="search" placeholder="Search sender, subject or text" value="${esc(q)}"></div>
      <button class="btn ghost" type="submit">Search</button></form>
    <div class="card">${list}</div>` });
}

function authLine(r) {
  if (r.direction === 'out') return `<span class="small muted">Sent by ${esc(r.sent_by || 'the office')} through Brevo</span>`;
  const a = parse(r.auth) || {};
  if (a.dmarc === 'pass') return `<span class="auth ok">${icon('check', 14)} Sender verified (${esc((r.from_addr.split('@')[1] || ''))})</span>`;
  if (a.dmarc === 'fail') return `<span class="auth bad">${icon('alert', 14)} Sender NOT verified</span>`;
  return `<span class="auth mid">${icon('alert', 14)} Sender partly verified: SPF ${esc(a.spf || '?')}, DKIM ${esc(a.dkim || '?')}, DMARC ${esc(a.dmarc || '?')}</span>`;
}

function messageCard(r, parsed, { open, images, cases }) {
  const warn = parse(r.warnings) || [];
  const atts = ((parsed && parsed.attachments) || []).filter(a => !a.inline);
  const hiddenImages = parsed && parsed.html && /<img\b[^>]*src\s*=\s*["']?https?:/i.test(parsed.html);
  const attList = atts.length ? `<div class="mail-atts">${atts.map(a => {
    const dl = `/admin/mail/${esc(r.id)}/att/${a.i}`;
    const risky = a.risk === 'danger';
    const toCase = !risky && cases.length && /\.(pdf|jpe?g|png)$/i.test(a.filename) ? `<details class="more"><summary>Save to a case</summary>
        <form method="post" action="/admin/mail/${esc(r.id)}/att/${a.i}/to-case"><select name="case_id">${cases.map(c => `<option value="${esc(c.id)}"${c.id === r.case_id ? ' selected' : ''}>${esc(c.reference)} · ${esc(c.services || '')}</option>`).join('')}</select>
        <button class="btn ghost sm" type="submit">Save</button></form></details>` : '';
    return `<div class="mail-att ${risky ? 'risky' : a.risk === 'caution' ? 'caution' : ''}">${icon(risky ? 'alert' : 'doc', 18)}<div class="row-main"><div class="row-title">${esc(a.filename)}</div><div class="row-sub">${esc(fmtSize(a.size))}${risky ? ' · can run programs: do not open' : a.risk === 'caution' ? ' · open only if expected' : ''}</div></div>
      <a class="btn ghost sm${risky ? ' danger' : ''}" href="${dl}"${risky ? ' data-confirm="This file type can install malware. Download it only if you are certain it is safe and expected."' : ''}>${risky ? 'Download anyway' : 'Download'}</a>${toCase}</div>`;
  }).join('')}</div>` : '';
  const head = `<div class="mail-head">${avatar(r.direction === 'out' ? 'Awal Global' : (r.from_name || r.from_addr))}<div class="row-main">
      <div class="row-title">${esc(r.direction === 'out' ? 'Awal Global Consults' : (r.from_name || r.from_addr))} <span class="small muted">&lt;${esc(r.from_addr)}&gt;</span></div>
      <div class="row-sub">To: ${esc(r.to_addrs)}${r.cc_addrs ? ` · Cc: ${esc(r.cc_addrs)}` : ''}${r.reply_to && r.reply_to !== r.from_addr ? ` · Reply-To: ${esc(r.reply_to)}` : ''}</div>
      <div class="row-sub">${esc(fmtDate(r.received_at))} · ${authLine(r)}</div></div></div>`;
  const warnings = warn.length ? `<div class="mail-warn">${warn.map(w => `<div class="note ${w.level === 'danger' ? 'err' : ''}">${icon('alert', 18)}<span>${esc(w.text)}</span></div>`).join('')}</div>` : '';
  const frame = parsed ? `<iframe class="mail-frame" title="Email content" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"${open ? '' : ' loading="lazy"'} src="/admin/mail/${esc(r.id)}/body${images ? '?images=1' : ''}"></iframe>
      ${hiddenImages && !images ? `<div class="small muted mail-imgnote">Pictures from the internet are hidden, so the sender cannot tell you opened this. <a href="/admin/mail/${esc(r.id)}?images=1">Show pictures</a></div>` : ''}`
    : `<div class="note">${icon('alert', 18)}<span>This email could not be read. Its original copy is kept; ask for help if it matters.</span></div>`;
  return `<details class="card mail-msg"${open ? ' open' : ''}><summary>${head}</summary><div class="card-body">${warnings}${frame}${attList}</div></details>`;
}

export function mailThreadPage({ admin, badges, row, thread, parsedById, images, cases, flash, client }) {
  const last = thread[thread.length - 1];
  const moves = row.folder === 'trash'
    ? `<button name="do" value="restore" class="btn ghost sm">Restore</button>`
    : `${row.folder === 'archive' ? '<button name="do" value="inbox" class="btn ghost sm">Move to inbox</button>' : '<button name="do" value="archive" class="btn ghost sm">Archive</button>'}
       ${row.folder === 'spam' ? '<button name="do" value="notspam" class="btn ghost sm">Not spam</button>' : row.direction === 'in' ? '<button name="do" value="spam" class="btn ghost sm">Spam</button>' : ''}
       <button name="do" value="${row.starred ? 'unstar' : 'star'}" class="btn ghost sm">${row.starred ? 'Unstar' : 'Star'}</button>
       ${row.direction === 'in' ? '<button name="do" value="unread" class="btn ghost sm">Mark unread</button>' : ''}
       <button name="do" value="trash" class="btn ghost sm danger">Delete</button>`;
  const linkCase = cases.length ? `<details class="more"><summary>${row.case_id ? 'Linked to a case' : 'Link to a case'}</summary>
      <form method="post" action="/admin/mail/${esc(row.id)}/action"><input type="hidden" name="do" value="link"><select name="case_id"><option value="">Not linked</option>${cases.map(c => `<option value="${esc(c.id)}"${c.id === row.case_id ? ' selected' : ''}>${esc(c.reference)} · ${esc(c.services || '')}</option>`).join('')}</select>
      <button class="btn ghost sm" type="submit">Save</button></form></details>` : '';
  const replyTo = last.direction === 'in' ? last.id : row.id;
  return shell({ title: row.subject || 'Email', active: 'mail', admin, badges, body: `
    <a class="crumb" href="/admin/mail?f=${esc(row.folder === 'sent' ? 'sent' : row.folder)}">${icon('back', 16)}${esc(MAIL_FOLDERS[row.folder] || 'Mail')}</a>
    ${flashHtml(flash)}
    <div class="card"><div class="card-body">
      <h1 class="mail-subject">${esc(row.subject || '(no subject)')}</h1>
      ${client ? `<a class="small" href="/admin/client/${esc(client.id)}">${icon('clients', 14)} ${esc(client.full_name)} (client)</a>${row.case_id ? ` · <a class="small" href="/admin/case/${esc(row.case_id)}">Linked case</a>` : ''}` : ''}
      <div class="btn-row"><a class="btn sm" href="/admin/mail/new?reply=${esc(replyTo)}">Reply</a>${last.direction === 'in' && (last.cc_addrs || '').trim() ? `<a class="btn ghost sm" href="/admin/mail/new?reply=${esc(replyTo)}&all=1">Reply all</a>` : ''}<a class="btn ghost sm" href="/admin/mail/new?fwd=${esc(last.id)}">Forward</a></div>
      <form method="post" action="/admin/mail/${esc(row.id)}/action" class="btn-row">${moves}</form>
      ${linkCase}
    </div></div>
    ${thread.map((r, i) => messageCard(r, parsedById[r.id], { open: i === thread.length - 1 || r.id === row.id, images, cases })).join('')}` });
}

export function composePage({ admin, badges, form, error = null, flash = null, replyRow = null, cases = [] }) {
  return shell({ title: 'New email', active: 'mail', admin, badges, body: `
    <a class="crumb" href="${replyRow ? `/admin/mail/${esc(replyRow.id)}` : '/admin/mail'}">${icon('back', 16)}${replyRow ? 'Back to the email' : 'Mail'}</a>
    ${flashHtml(flash)}${error ? `<div class="note err">${icon('alert', 18)}<span>${esc(error)}</span></div>` : ''}
    <div class="card"><div class="card-head"><h2>${replyRow ? 'Reply' : form.fwd ? 'Forward' : 'New email'}</h2></div><div class="card-body">
    <form method="post" action="/admin/mail/send" enctype="multipart/form-data" class="mail-compose">
      <input type="hidden" name="reply" value="${esc(form.reply || '')}"><input type="hidden" name="fwd" value="${esc(form.fwd || '')}">
      <label>From</label><input value="Awal Global Consults <${esc(mailFrom({}).email)}>" disabled>
      <label for="m-to">To</label><input id="m-to" name="to" required maxlength="1000" value="${esc(form.to || '')}" placeholder="name@example.com" autocomplete="off">
      <label for="m-cc">Cc (optional)</label><input id="m-cc" name="cc" maxlength="1000" value="${esc(form.cc || '')}">
      <label for="m-subject">Subject</label><input id="m-subject" name="subject" required maxlength="200" value="${esc(form.subject || '')}">
      <label for="m-body">Message</label><textarea id="m-body" name="body" rows="12" maxlength="20000" required>${esc(form.body || '')}</textarea>
      <label for="m-sig">Signature</label><textarea id="m-sig" name="signature" rows="3" maxlength="500">${esc(form.signature == null ? DEFAULT_SIGNATURE : form.signature)}</textarea>
      ${form.fwdAtts && form.fwdAtts.length ? `<label class="check"><input type="checkbox" name="fwd_atts" value="1" checked> Include the ${form.fwdAtts.length} attachment${form.fwdAtts.length === 1 ? '' : 's'} (${esc(form.fwdAtts.map(a => a.filename).join(', '))})</label>` : ''}
      <label for="m-files">Attach files (optional, up to 10MB in total)</label><input id="m-files" name="files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv,.txt">
      ${cases.length ? `<label for="m-case">Link to a case (optional)</label><select id="m-case" name="case_id"><option value="">Not linked</option>${cases.map(c => `<option value="${esc(c.id)}"${c.id === form.case_id ? ' selected' : ''}>${esc(c.reference)} · ${esc(c.services || '')}</option>`).join('')}</select>` : ''}
      <p class="small muted">Sent from info@ through Brevo, signed for your domain. Replies come back to this mailbox and your usual inbox.</p>
      <div class="btn-row"><button class="btn" type="submit">${icon('mail', 16)}Send</button></div>
    </form></div></div>` });
}
