/**
 * Mailbox and settings pages of the dashboard (/admin/mail, /admin/settings). See mail.js for how
 * mail is received, checked and sent, and totp.js for the authenticator app.
 */
import { esc, fmtDate, fmtSize, ago, icon, pill, avatar, emptyState, flashHtml, shell, pageHead } from './admin-ui.js';
import { MAIL_FOLDERS, TRASH_DAYS, signatureFor, receiptState } from './mail.js';

export const MAIL_FLASH = {
  mail_sent: ['ok', 'Email sent.'],
  mail_failed: ['err', 'The email could not be sent. Nothing was lost: your message is saved in Drafts. Try again in a minute.'],
  mail_limit: ['err', 'Sending limit reached for this hour. This protects your domain if a login is ever misused. Try again later.'],
  mail_moved: ['ok', 'Done.'],
  mail_linked: ['ok', 'Linked to the case.'],
  mail_saved_doc: ['ok', 'Attachment saved to the case documents.'],
  mail_doc_bad: ['err', 'That attachment cannot be added to a case: only genuine PDF, JPG or PNG files up to 7MB.'],
  mail_blocked: ['ok', 'Sender blocked. Their emails will go straight to Spam. Unblock them in Settings.'],
  mail_all_read: ['ok', 'All emails marked as read.'],
  mail_purged: ['ok', 'Deleted for good.'],
  draft_discarded: ['ok', 'Draft discarded.'],
  ids_saved: ['ok', 'Senders and signatures saved.'],
  unblocked: ['ok', 'Sender unblocked.'],
  totp_on: ['ok', 'Authenticator app linked. Keep your recovery codes somewhere safe.'],
  totp_bad: ['err', 'That code did not match. Check the time on your phone is set automatically and try the newest code.'],
  totp_off: ['ok', 'Authenticator app removed. Sign in with emailed codes, or link it again.'],
  recovery_used: ['err', 'You signed in with a recovery code. It cannot be used again. If your phone is lost, remove the old authenticator below and link a new one.']
};
const parse = s => { try { return JSON.parse(s || 'null'); } catch (e) { return null; } };
const shortBox = a => String(a || '').split('@')[0];

/** ✓ sent · ✓✓ delivered · blue ✓✓ read */
export function ticks(row, { label = false } = {}) {
  const r = receiptState(row);
  if (!r) return '';
  const when = fmtDate(r.at);
  const t = { sent: ['✓', 'Sent', 'tick-sent'], delivered: ['✓✓', 'Delivered', 'tick-delivered'], read: ['✓✓', 'Read', 'tick-read'] }[r.state];
  return `<span class="ticks ${t[2]}" title="${t[1]} ${esc(when)}" aria-label="${t[1]}">${t[0]}${label ? ` <span class="tick-label">${t[1]} ${esc(when)}</span>` : ''}</span>`;
}

function folderTabs(folder, counts, box) {
  const q = box ? `&box=${encodeURIComponent(box)}` : '';
  return `<div class="tabs mail-tabs">${Object.entries(MAIL_FOLDERS).map(([k, label]) =>
    `<a href="/admin/mail?f=${k}${q}" class="${k === folder ? 'on' : ''}">${label}${counts[k] ? ` <span class="count-in">${counts[k]}</span>` : ''}</a>`).join('')}</div>`;
}

export function mailSetupPage({ admin, badges }) {
  return shell({ title: 'Mail', active: 'mail', admin, badges, body: `${pageHead('Mail', 'Your company email in the dashboard')}
    <div class="card"><div class="card-body">${emptyState('mail', 'The mailbox is not set up yet', 'The mail table needs to be added to the database, and the awal-mail Worker connected to your addresses. See ops/RUNBOOK.md, "Dashboard mailbox".')}</div></div>` });
}

export function mailListPage({ admin, badges, folder, rows, q, counts, flash, box, identities }) {
  const list = rows.length ? `<div class="rows">${rows.map(r => {
    const warn = parse(r.warnings) || [];
    const danger = warn.some(w => w.level === 'danger'), caution = !danger && warn.length;
    const unread = r.direction === 'in' && !r.read_at && r.folder !== 'drafts';
    const draft = r.folder === 'drafts';
    const href = draft ? `/admin/mail/new?draft=${esc(r.id)}` : `/admin/mail/${esc(r.id)}`;
    const who = draft ? `<span class="draft-label">Draft</span> ${esc(r.to_addrs || '(no recipient yet)')}` : esc(r.direction === 'out' ? `To: ${r.to_addrs}` : (r.from_name || r.from_addr));
    return `<a class="row mail-row${unread ? ' unread' : ''}" href="${href}">${avatar(r.direction === 'out' ? (r.to_addrs || 'Draft') : (r.from_name || r.from_addr))}
      <div class="row-main"><div class="row-title">${unread ? '<span class="dot" aria-label="Unread"></span>' : ''}${who}${r.thread_count > 1 ? ` <span class="muted small">(${r.thread_count})</span>` : ''}</div>
      <div class="row-sub"><strong>${esc(r.subject || '(no subject)')}</strong>${r.snippet ? ` · ${esc(r.snippet)}` : ''}</div></div>
      <div class="row-side"><span class="small muted">${ticks(r)} ${esc(ago(r.received_at))}</span>
        <span>${danger ? pill('Warning', 'red') : caution ? pill('Check', 'amber') : ''}${r.attachments ? icon('doc', 15) : ''}${r.starred ? '★' : ''}${r.client_id ? pill('Client', 'blue') : ''}${identities.length > 1 && r.mailbox ? `<span class="box-tag">${esc(shortBox(r.mailbox))}@</span>` : ''}</span></div></a>`;
  }).join('')}</div>${rows.length >= 50 ? `<div class="card-body"><a class="btn ghost sm" href="/admin/mail?f=${esc(folder)}${box ? `&box=${encodeURIComponent(box)}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}&before=${encodeURIComponent(rows[rows.length - 1].received_at)}">Older</a></div>` : ''}`
    : `<div class="card-body">${emptyState('mail', q ? 'No emails match your search' : folder === 'inbox' ? 'No emails yet' : `Nothing in ${MAIL_FOLDERS[folder]}`, folder === 'trash' ? `Emails in Trash are deleted for good after ${TRASH_DAYS} days.` : folder === 'drafts' ? 'Anything you start writing is saved here automatically, on your phone and on the web.' : folder === 'spam' ? 'Forged, lookalike and blocked senders land here.' : '')}</div>`;
  const boxes = identities.length > 1 ? `<div class="chips mail-boxes"><a class="${!box ? 'on' : ''}" href="/admin/mail?f=${esc(folder)}">All addresses</a>${identities.map(i => `<a class="${box === i.email ? 'on' : ''}" href="/admin/mail?f=${esc(folder)}&box=${encodeURIComponent(i.email)}">${esc(shortBox(i.email))}@</a>`).join('')}</div>` : '';
  return shell({ title: 'Mail', active: 'mail', admin, badges, body: `
    ${pageHead('Mail', counts.unread ? `${counts.unread} unread` : 'All read', `<a class="btn ghost sm" href="/admin/settings#mail">Settings</a> <a class="btn sm" href="/admin/mail/new${box ? `?from=${encodeURIComponent(box)}` : ''}">${icon('plus', 16)}New email</a>`)}
    ${flashHtml(flash)}
    ${boxes}
    ${folderTabs(folder, { inbox: counts.unread, drafts: counts.drafts, spam: counts.spam }, box)}
    <form class="toolbar" method="get" action="/admin/mail"><input type="hidden" name="f" value="${esc(folder)}">${box ? `<input type="hidden" name="box" value="${esc(box)}">` : ''}
      <div class="search">${icon('search', 18)}<input name="q" type="search" placeholder="Search sender, subject or text" value="${esc(q)}"></div>
      <button class="btn ghost" type="submit">Search</button></form>
    <div class="card">${list}</div>
    ${folder === 'inbox' && counts.unread ? `<form method="post" action="/admin/mail/read-all"><button class="btn ghost sm" type="submit">Mark all as read</button></form>` : ''}
    ${folder === 'sent' ? `<p class="small muted">${ticks({ direction: 'out', folder: 'sent', received_at: new Date().toISOString() })} sent · <span class="ticks tick-delivered">✓✓</span> delivered · <span class="ticks tick-read">✓✓</span> read. Read ticks appear when the recipient's email app loads pictures, so a read email can stay grey.</p>` : ''}` });
}

function authLine(r) {
  if (r.direction === 'out') return `<span class="small muted">From ${esc(r.from_addr)}${r.sent_by ? `, sent by ${esc(r.sent_by)}` : ''}</span> ${ticks(r, { label: true })}`;
  const a = parse(r.auth) || {};
  if (a.dmarc === 'pass') return `<span class="auth ok">${icon('check', 14)} Sender verified (${esc((r.from_addr.split('@')[1] || ''))})</span>`;
  if (a.dmarc === 'fail') return `<span class="auth bad">${icon('alert', 14)} Sender NOT verified</span>`;
  return `<span class="auth mid">${icon('alert', 14)} Sender partly verified: SPF ${esc(a.spf || '?')}, DKIM ${esc(a.dkim || '?')}, DMARC ${esc(a.dmarc || '?')}</span>`;
}

function receiptsList(r) {
  const rec = parse(r.receipts) || {};
  const all = [...String(r.to_addrs || '').split(','), ...String(r.cc_addrs || '').split(',')].map(x => x.trim()).filter(Boolean);
  if (r.direction !== 'out' || all.length < 2) return '';
  return `<div class="small muted receipts">${all.map(a => { const x = rec[a] || {}; return `${esc(a)}: ${x.opened ? `<span class="tick-read">✓✓ read ${esc(fmtDate(x.opened))}</span>` : x.delivered ? '<span class="tick-delivered">✓✓ delivered</span>' : '✓ sent'}`; }).join('<br>')}</div>`;
}

function messageCard(r, parsed, { open, images, cases }) {
  const warn = parse(r.warnings) || [];
  const atts = ((parsed && parsed.attachments) || []).filter(a => !a.inline);
  const hiddenImages = parsed && parsed.html && r.direction === 'in' && /<img\b[^>]*src\s*=\s*["']?https?:/i.test(parsed.html);
  const attList = atts.length ? `<div class="mail-atts">${atts.map(a => {
    const dl = `/admin/mail/${esc(r.id)}/att/${a.i}`;
    const risky = a.risk === 'danger';
    const toCase = !risky && cases.length && /\.(pdf|jpe?g|png)$/i.test(a.filename) ? `<details class="more"><summary>Save to a case</summary>
        <form method="post" action="/admin/mail/${esc(r.id)}/att/${a.i}/to-case"><select name="case_id">${cases.map(c => `<option value="${esc(c.id)}"${c.id === r.case_id ? ' selected' : ''}>${esc(c.reference)} · ${esc(c.services || '')}</option>`).join('')}</select>
        <button class="btn ghost sm" type="submit">Save</button></form></details>` : '';
    return `<div class="mail-att ${risky ? 'risky' : a.risk === 'caution' ? 'caution' : ''}">${icon(risky ? 'alert' : 'doc', 18)}<div class="row-main"><div class="row-title">${esc(a.filename)}</div><div class="row-sub">${esc(fmtSize(a.size))}${risky ? ' · can run programs: do not open' : a.risk === 'caution' ? ' · open only if expected' : ''}</div></div>
      <a class="btn ghost sm${risky ? ' danger' : ''}" href="${dl}"${risky ? ' data-confirm="This file type can install malware. Download it only if you are certain it is safe and expected."' : ''}>${risky ? 'Download anyway' : 'Download'}</a>${toCase}</div>`;
  }).join('')}</div>` : '';
  const head = `<div class="mail-head">${avatar(r.direction === 'out' ? (r.from_name || 'Awal Global') : (r.from_name || r.from_addr))}<div class="row-main">
      <div class="row-title">${esc(r.from_name || r.from_addr)} <span class="small muted">&lt;${esc(r.from_addr)}&gt;</span></div>
      <div class="row-sub">To: ${esc(r.to_addrs)}${r.cc_addrs ? ` · Cc: ${esc(r.cc_addrs)}` : ''}${r.reply_to && r.reply_to !== r.from_addr ? ` · Reply-To: ${esc(r.reply_to)}` : ''}</div>
      <div class="row-sub">${esc(fmtDate(r.received_at))} · ${authLine(r)}</div></div></div>`;
  const warnings = warn.length ? `<div class="mail-warn">${warn.map(w => `<div class="note ${w.level === 'danger' ? 'err' : ''}">${icon('alert', 18)}<span>${esc(w.text)}</span></div>`).join('')}</div>` : '';
  const frame = parsed ? `<iframe class="mail-frame" title="Email content" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"${open ? '' : ' loading="lazy"'} src="/admin/mail/${esc(r.id)}/body${images ? '?images=1' : ''}"></iframe>
      ${hiddenImages && !images ? `<div class="small muted mail-imgnote">Pictures from the internet are hidden, so the sender cannot tell you opened this. <a href="/admin/mail/${esc(r.id)}?images=1">Show pictures</a></div>` : ''}`
    : `<div class="note">${icon('alert', 18)}<span>This email could not be read. Its original copy is kept; ask for help if it matters.</span></div>`;
  return `<details class="card mail-msg"${open ? ' open' : ''}><summary>${head}</summary><div class="card-body">${warnings}${receiptsList(r)}${frame}${attList}</div></details>`;
}

export function mailThreadPage({ admin, badges, row, thread, parsedById, images, cases, flash, client }) {
  const last = thread[thread.length - 1];
  const lastIn = [...thread].reverse().find(r => r.direction === 'in');
  const moves = row.folder === 'trash'
    ? `<button name="do" value="restore" class="btn ghost sm">Restore</button><button name="do" value="purge" class="btn ghost sm danger" data-confirm-btn="1">Delete for good</button>`
    : `${row.folder === 'archive' ? '<button name="do" value="inbox" class="btn ghost sm">Move to inbox</button>' : '<button name="do" value="archive" class="btn ghost sm">Archive</button>'}
       ${row.folder === 'spam' ? '<button name="do" value="notspam" class="btn ghost sm">Not spam</button>' : lastIn ? '<button name="do" value="spam" class="btn ghost sm">Spam</button>' : ''}
       ${lastIn ? `<button name="do" value="block" class="btn ghost sm">Block ${esc(lastIn.from_addr)}</button>` : ''}
       <button name="do" value="${row.starred ? 'unstar' : 'star'}" class="btn ghost sm">${row.starred ? 'Unstar' : 'Star'}</button>
       ${lastIn ? '<button name="do" value="unread" class="btn ghost sm">Mark unread</button>' : ''}
       <button name="do" value="trash" class="btn ghost sm danger">Delete</button>`;
  const linkCase = cases.length ? `<details class="more"><summary>${row.case_id ? 'Linked to a case' : 'Link to a case'}</summary>
      <form method="post" action="/admin/mail/${esc(row.id)}/action"><input type="hidden" name="do" value="link"><select name="case_id"><option value="">Not linked</option>${cases.map(c => `<option value="${esc(c.id)}"${c.id === row.case_id ? ' selected' : ''}>${esc(c.reference)} · ${esc(c.services || '')}</option>`).join('')}</select>
      <button class="btn ghost sm" type="submit">Save</button></form></details>` : '';
  const replyTo = lastIn ? lastIn.id : last.id;
  const multi = lastIn && ((lastIn.cc_addrs || '').trim() || String(lastIn.to_addrs || '').split(',').length > 1);
  return shell({ title: row.subject || 'Email', active: 'mail', admin, badges, body: `
    <a class="crumb" href="/admin/mail?f=${esc(row.folder)}">${icon('back', 16)}${esc(MAIL_FOLDERS[row.folder] || 'Mail')}</a>
    ${flashHtml(flash)}
    <div class="card"><div class="card-body">
      <h1 class="mail-subject">${esc(row.subject || '(no subject)')}</h1>
      ${client ? `<a class="small" href="/admin/client/${esc(client.id)}">${icon('clients', 14)} ${esc(client.full_name)} (client)</a>${row.case_id ? ` · <a class="small" href="/admin/case/${esc(row.case_id)}">Linked case</a>` : ''}` : ''}
      <div class="btn-row"><a class="btn sm" href="/admin/mail/new?reply=${esc(replyTo)}">Reply</a>${multi ? `<a class="btn ghost sm" href="/admin/mail/new?reply=${esc(replyTo)}&all=1">Reply all</a>` : ''}<a class="btn ghost sm" href="/admin/mail/new?fwd=${esc(last.id)}">Forward</a></div>
      <form method="post" action="/admin/mail/${esc(row.id)}/action" class="btn-row">${moves}</form>
      ${linkCase}
    </div></div>
    ${thread.map((r, i) => messageCard(r, parsedById[r.id], { open: i === thread.length - 1 || r.id === row.id, images, cases })).join('')}` });
}

export function composePage({ admin, badges, form, identities, error = null, flash = null, replyRow = null, cases = [], draftAtts = [] }) {
  const from = identities.find(i => i.email === form.from) || identities[0];
  const sigs = Object.fromEntries(identities.map(i => [i.email, signatureFor(i).text]));
  const back = replyRow ? `/admin/mail/${esc(replyRow.id)}` : '/admin/mail';
  return shell({ title: form.draft ? 'Draft' : 'New email', active: 'mail', admin, badges, body: `
    <a class="crumb" href="${back}">${icon('back', 16)}${replyRow ? 'Back to the email' : 'Mail'}</a>
    ${flashHtml(flash)}${error ? `<div class="note err">${icon('alert', 18)}<span>${esc(error)}</span></div>` : ''}
    <div class="card"><div class="card-head"><h2>${form.reply ? 'Reply' : form.fwd ? 'Forward' : form.draft ? 'Draft' : 'New email'}</h2><span class="small muted draft-status" aria-live="polite">${form.draft ? 'Saved in Drafts' : ''}</span></div><div class="card-body">
    <form method="post" action="/admin/mail/send" enctype="multipart/form-data" class="mail-compose" data-autosave="1" data-signatures="${esc(JSON.stringify(sigs))}">
      <input type="hidden" name="draft" value="${esc(form.draft || '')}"><input type="hidden" name="reply" value="${esc(form.reply || '')}"><input type="hidden" name="fwd" value="${esc(form.fwd || '')}">
      <label for="m-from">From</label><select id="m-from" name="from">${identities.map(i => `<option value="${esc(i.email)}"${i.email === from.email ? ' selected' : ''}>${esc(i.name)} &lt;${esc(i.email)}&gt;</option>`).join('')}</select>
      <label for="m-to">To</label><input id="m-to" name="to" required maxlength="1000" value="${esc(form.to || '')}" placeholder="name@example.com" autocomplete="off" inputmode="email">
      <details class="more"${form.cc || form.bcc ? ' open' : ''}><summary>Cc and Bcc</summary>
        <label for="m-cc">Cc</label><input id="m-cc" name="cc" maxlength="1000" value="${esc(form.cc || '')}" inputmode="email">
        <label for="m-bcc">Bcc (hidden from the others)</label><input id="m-bcc" name="bcc" maxlength="1000" value="${esc(form.bcc || '')}" inputmode="email"></details>
      <label for="m-subject">Subject</label><input id="m-subject" name="subject" required maxlength="200" value="${esc(form.subject || '')}">
      <label for="m-body">Message</label><textarea id="m-body" name="body" rows="12" maxlength="20000" required>${esc(form.body || '')}</textarea>
      <label class="check"><input type="checkbox" name="sig" value="1"${form.sig === '0' ? '' : ' checked'}> Add the signature for this address</label>
      <pre class="sig-preview small muted">${esc(signatureFor(from).text)}</pre>
      ${form.fwdAtts && form.fwdAtts.length ? `<label class="check"><input type="checkbox" name="fwd_atts" value="1"${form.fwd_atts === '0' ? '' : ' checked'}> Include the ${form.fwdAtts.length} attachment${form.fwdAtts.length === 1 ? '' : 's'} (${esc(form.fwdAtts.map(a => a.filename).join(', '))})</label>` : ''}
      <label for="m-files">Attach files (up to 10MB in total)</label>
      <div class="draft-atts">${draftAtts.map(a => `<span class="att-chip" data-n="${a.n}">${icon('doc', 14)} ${esc(a.name)} <span class="muted">${esc(fmtSize(a.size))}</span> <button type="button" class="att-remove" data-n="${a.n}" aria-label="Remove ${esc(a.name)}">×</button></span>`).join('')}</div>
      <input id="m-files" name="files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip">
      ${cases.length ? `<label for="m-case">Link to a case (optional)</label><select id="m-case" name="case_id"><option value="">Not linked</option>${cases.map(c => `<option value="${esc(c.id)}"${c.id === form.case_id ? ' selected' : ''}>${esc(c.reference)} · ${esc(c.services || '')}</option>`).join('')}</select>` : ''}
      <p class="small muted">Everything you type is saved to Drafts as you go, so you can finish it on another device. Sent through Brevo and signed for awalglobal.com.ng.</p>
      <div class="btn-row"><button class="btn" type="submit">${icon('mail', 16)}Send</button>${form.draft ? `<button class="btn ghost danger" type="submit" formaction="/admin/mail/draft/${esc(form.draft)}/discard" formnovalidate>Discard draft</button>` : ''}</div>
    </form></div></div>` });
}

// ── Settings: authenticator, senders and signatures, blocked senders ──
export function settingsPage({ admin, badges, flash, totp, setup, recoveryCodes, identities, blocked, mailReady, webhook }) {
  const auth = recoveryCodes ? `
      <div class="note">${icon('lock', 18)}<span><strong>Save these recovery codes now.</strong> Each one signs you in once if you lose your phone. They will not be shown again.</span></div>
      <pre class="recovery">${recoveryCodes.map(esc).join('\n')}</pre>`
    : totp.enabled ? `
      <p>${pill('On', 'green')} Linked ${esc(fmtDate(totp.enabledAt))}. ${totp.recoveryLeft} recovery code${totp.recoveryLeft === 1 ? '' : 's'} left.</p>
      <p class="small muted">On the sign-in page, tap <strong>Use your authenticator app instead</strong> and enter the 6-digit code. Emailed codes still work too.</p>
      <form method="post" action="/admin/settings/totp/off" data-confirm="Remove the authenticator app? You can link it again at any time."><button class="btn ghost sm danger" type="submit">Remove authenticator</button></form>
      <form method="post" action="/admin/settings/totp/start"><button class="btn ghost sm" type="submit">Link a new phone (replaces the old one)</button></form>`
    : setup ? `
      <ol class="steps-list">
        <li>Open Google Authenticator, Microsoft Authenticator or Authy on your phone and tap <strong>+</strong>.</li>
        <li>Scan this code${''} or, on this phone, <a href="${esc(setup.uri)}">open it in your authenticator app</a>.</li>
      </ol>
      <div class="qr">${setup.qrSvg}</div>
      <p class="small muted">Can't scan? Enter this key by hand (time-based): <code>${esc(setup.secretGrouped)}</code></p>
      <form method="post" action="/admin/settings/totp/confirm"><label for="t-code">Then enter the 6-digit code the app shows</label>
        <input id="t-code" class="code-input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required>
        <div class="btn-row"><button class="btn" type="submit">Turn on</button></div></form>`
    : `<p class="small muted" style="margin-top:0">Sign in with a 6-digit code from an app on your phone instead of waiting for an email: useful on a new device or if the mailbox is unreachable. You also get ten one-time recovery codes.</p>
      <form method="post" action="/admin/settings/totp/start"><button class="btn" type="submit">${icon('lock', 16)}Set up authenticator app</button></form>`;

  const ids = mailReady ? `<form method="post" action="/admin/settings/identities">
      ${identities.map((i, n) => `<fieldset class="id-box"><legend>${esc(i.email)}</legend>
        <input type="hidden" name="email_${n}" value="${esc(i.email)}">
        <label>Name shown to recipients</label><input name="name_${n}" maxlength="80" required value="${esc(i.name)}">
        <label>Title</label><input name="title_${n}" maxlength="100" value="${esc(i.title || '')}">
        <label>Other signature lines (one per line)</label><textarea name="lines_${n}" rows="3" maxlength="400">${esc((i.lines || []).join('\n'))}</textarea>
        <div class="sig-sample">${signatureFor(i).html}</div></fieldset>`).join('')}
      <div class="btn-row"><button class="btn" type="submit">Save senders and signatures</button></div></form>
      <p class="small muted">To receive mail for an address in the dashboard, its Cloudflare Email Routing rule must send it to the awal-mail Worker (ops/RUNBOOK.md, section 10).</p>` : '<p class="small muted">Available once the mailbox is set up.</p>';

  const block = mailReady ? (blocked.length ? `<div class="rows">${blocked.map(b => `<div class="row"><div class="row-main"><div class="row-title">${esc(b)}</div></div>
      <form method="post" action="/admin/settings/unblock"><input type="hidden" name="addr" value="${esc(b)}"><button class="btn ghost sm" type="submit">Unblock</button></form></div>`).join('')}</div>`
    : '<p class="small muted">No blocked senders. Use "Block" on an email to send that sender straight to Spam.</p>') : '';

  return shell({ title: 'Settings', active: '', admin, badges, body: `
    ${pageHead('Settings', esc(admin))}
    ${flashHtml(flash)}
    <div class="grid grid-2">
      <div><div class="card" id="security"><div class="card-head"><h2>Authenticator app</h2></div><div class="card-body">${auth}</div></div>
        ${mailReady ? `<div class="card"><div class="card-head"><h2>Blocked senders</h2></div>${blocked.length ? block : `<div class="card-body">${block}</div>`}</div>
        <div class="card"><div class="card-head"><h2>Delivered and read ticks</h2></div><div class="card-body small">
          <p style="margin-top:0"><span class="ticks tick-sent">✓</span> sent · <span class="ticks tick-delivered">✓✓</span> delivered to the recipient's email server · <span class="ticks tick-read">✓✓</span> opened.</p>
          <p>Brevo reports these to the dashboard. ${webhook ? `${pill('On', 'green')} since ${esc(fmtDate(webhook.createdAt))}.` : `${pill('Starting', 'amber')} It switches on with the first email you send or the next morning job.`}</p>
          <p class="muted">"Opened" means the email's pictures loaded. Some email apps load pictures automatically and others block them, so treat the blue ticks as a strong hint, not proof.</p></div></div>` : ''}
      </div>
      <div><div class="card" id="mail"><div class="card-head"><h2>Sending addresses and signatures</h2></div><div class="card-body">${ids}</div></div></div>
    </div>` });
}
