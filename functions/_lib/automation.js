/**
 * The daily job (triggered at 8am Lagos time via /cron/daily):
 *   1. Sends clients a polite reminder when we have waited on them for
 *      3 days and again at 7 days (quote sent / awaiting documents).
 *      Reminders stop as soon as the case status changes.
 *   2. Emails you a summary: new cases, follow-ups due, cases waiting on
 *      clients, cases in progress, and records past their retention date.
 *   3. Backs up the database to the private bucket (kept 30 days).
 *   4. Reminds clients the day before a booked consultation.
 *   5. From Monday, emails confirmed newsletter subscribers the guides
 *      published in the previous week (in batches, if there are many).
 * It runs at most once per Lagos calendar day.
 */
import { sendBrevoEmail } from './brevo.js';
import { adminEmails } from './admin-auth.js';
import { caseReminderEmail, dailySummaryEmail, bookingReminderEmail, digestEmail } from './email-templates.js';
import { sendBrevoBatch } from './brevo.js';
import { CONSULT_TYPES, MODES, fmtLagos, feeText } from './booking.js';
import { statusInfo, SITE_URL } from './cases.js';
import { backupDatabase } from './compliance.js';

const DAY_MS = 86400000;
const REMINDER_DAYS = [3, 7];          // reminder 1 after 3 days, reminder 2 after 7
const MAX_REMINDERS_PER_RUN = 20;      // stays well inside Cloudflare's per-request limits
const STALE_IN_PROGRESS_DAYS = 14;     // flag filings with no movement for two weeks
const ACTOR = 'system:daily-job';
const MAX_DIGEST_PER_RUN = 250;
const MAX_DIGEST_GUIDES = 8;           // longer weeks link to the blog for the rest        // stays inside Brevo's free plan of 300 emails a day

/** Today's date in Lagos (UTC+1, no daylight saving), as YYYY-MM-DD. */
export function lagosDate(now = new Date()) {
  return new Date(now.getTime() + 3600000).toISOString().slice(0, 10);
}

function daysSince(iso, now) {
  return iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS) : 0;
}


/** ISO week key (e.g. 2026-W45) and the Monday it starts on, in Lagos time. */
function digestWeek(now) {
  const l = new Date(now.getTime() + 3600000);
  const day = (l.getUTCDay() + 6) % 7;                       // Monday = 0
  const monday = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() - day));
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday - yearStart) / DAY_MS + 1) / 7);
  return { key: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, monday: monday.toISOString().slice(0, 10) };
}

/** Weekly guides email: guides dated in the 7 days before this week's Monday. */
async function sendDigest(env, request, now) {
  const { key, monday } = digestWeek(now);
  const from = new Date(new Date(monday + 'T00:00:00Z').getTime() - 7 * DAY_MS).toISOString().slice(0, 10);
  let index = [];
  try {
    const res = env.ASSETS ? await env.ASSETS.fetch(new URL('/blog/search-index.json', request.url)) : await fetch(`${SITE_URL}/blog/search-index.json`);
    index = await res.json();
  } catch (err) {
    console.error('daily job: could not read guide index:', err && err.message);
    return null;
  }
  const all = index.filter(g => g.p && g.p >= from && g.p < monday)
    .sort((x, y) => (y.p > x.p ? 1 : y.p < x.p ? -1 : 0))
    .map(g => ({ title: g.t, description: g.d, topic: g.c, url: `${SITE_URL}/blog/${g.u}` }));
  if (!all.length) return null;
  const guides = all.slice(0, MAX_DIGEST_GUIDES);
  const moreCount = all.length - guides.length;

  const rows = (await env.DB.prepare(
    "SELECT id, email, token FROM subscribers WHERE status = 'confirmed' AND (last_digest IS NULL OR last_digest != ?1) ORDER BY confirmed_at LIMIT ?2"
  ).bind(key, MAX_DIGEST_PER_RUN + 1).all()).results || [];
  if (!rows.length) return null;
  const batch = rows.slice(0, MAX_DIGEST_PER_RUN);
  const versions = batch.map(r => {
    const unsubscribeUrl = `${SITE_URL}/unsubscribe?t=${encodeURIComponent(r.token)}`;
    return {
      to: { email: r.email },
      html: digestEmail({ guides, moreCount, unsubscribeUrl }),
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    };
  });
  try {
    for (let i = 0; i < versions.length; i += 100) {
      await sendBrevoBatch(env, { subject: all.length > 1 ? `Awal Guides this week: ${all.length} new guides` : `New on Awal Guides: ${guides[0].title}`, versions: versions.slice(i, i + 100) });
    }
  } catch (err) {
    console.error('daily job: digest failed:', err && err.message);
    return null;
  }
  const ids = batch.map(r => r.id);
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    await env.DB.prepare(`UPDATE subscribers SET last_digest = ?1 WHERE id IN (${chunk.map((_, j) => `?${j + 2}`).join(',')})`).bind(key, ...chunk).run();
  }
  return { key, sent: batch.length, remaining: rows.length > MAX_DIGEST_PER_RUN ? 'some' : 0, guides: all.length };
}

function caseUrl(id) {
  return `${SITE_URL}/admin/case/${id}`;
}

function shortDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short' });
}

export async function runDailyJob(env, request, { now = new Date() } = {}) {
  const nowIso = now.toISOString();
  const runDate = lagosDate(now);
  const ip = request.headers.get('CF-Connecting-IP');

  // Claim today's run; a second trigger on the same day does nothing
  const claimed = await env.DB
    .prepare("INSERT INTO job_runs (job, run_date, ran_at) VALUES ('daily', ?1, ?2) ON CONFLICT DO NOTHING RETURNING job")
    .bind(runDate, nowIso).first();
  if (!claimed) return { ran: false, reason: `already ran for ${runDate}` };

  // ── 1. Client reminders ───────────────────────────────────────
  const waitingRows = (await env.DB.prepare(
    `SELECT c.id, c.reference, c.kind, c.status, c.status_changed_at, cl.full_name, cl.email, cl.anonymised_at,
            (SELECT COUNT(*) FROM case_events e WHERE e.case_id = c.id AND e.event = 'reminder_sent'
               AND e.created_at >= c.status_changed_at) AS reminders
     FROM cases c JOIN clients cl ON cl.id = c.client_id
     WHERE c.kind = 'application' AND c.status IN ('quote_sent', 'awaiting_documents')
     ORDER BY c.status_changed_at`
  ).all()).results || [];

  const remindersSent = [];
  for (const c of waitingRows) {
    if (remindersSent.length >= MAX_REMINDERS_PER_RUN) break;
    const days = daysSince(c.status_changed_at, now);
    const due = c.reminders < REMINDER_DAYS.length && days >= REMINDER_DAYS[c.reminders];
    if (!due || !c.email || c.anonymised_at) continue;

    const reminderNumber = c.reminders + 1;
    try {
      await sendBrevoEmail(env, {
        to: { email: c.email, name: c.full_name },
        subject: c.status === 'awaiting_documents'
          ? `Reminder: we need a few more things for ${c.reference}`
          : `Following up on your quote: ${c.reference}`,
        html: caseReminderEmail({ fullName: c.full_name, reference: c.reference, status: c.status, reminderNumber }),
        replyTo: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' }
      });
    } catch (err) {
      console.error('daily job: reminder failed for', c.reference, err && err.message);
      continue;
    }
    await env.DB.batch([
      env.DB.prepare("INSERT INTO case_events (case_id, event, to_status, note, actor, created_at) VALUES (?1, 'reminder_sent', ?2, ?3, ?4, ?5)")
        .bind(c.id, c.status, `Automatic reminder ${reminderNumber} emailed to ${c.email}`, ACTOR, nowIso),
      env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, ?2, 'case.reminder_sent', 'case', ?3, ?4, ?5)")
        .bind(nowIso, ACTOR, c.id, JSON.stringify({ reference: c.reference, reminder: reminderNumber }), ip)
    ]);
    c.reminders = reminderNumber;
    remindersSent.push({ reference: c.reference, name: c.full_name, url: caseUrl(c.id), detail: `Reminder ${reminderNumber} · ${statusInfo('application', c.status).label} for ${days} days` });
  }

  // ── 1b. Consultation reminders (the day before) ──────────────
  const soonRows = (await env.DB.prepare(
    `SELECT * FROM bookings WHERE status != 'cancelled' AND slot_start >= ?1 AND slot_start < ?2 ORDER BY slot_start`
  ).bind(nowIso, new Date(now.getTime() + 2 * DAY_MS).toISOString()).all()).results || [];
  for (const b of soonRows) {
    const hoursAway = (new Date(b.slot_start).getTime() - now.getTime()) / 3600000;
    if (b.reminded_at || hoursAway < 12 || hoursAway > 36) continue;
    const t = CONSULT_TYPES[b.type];
    try {
      await sendBrevoEmail(env, {
        to: { email: b.email, name: b.full_name },
        subject: `Reminder: your consultation on ${fmtLagos(b.slot_start)}`,
        html: bookingReminderEmail({
          fullName: b.full_name, cancelUrl: `${SITE_URL}/book-cancel?t=${encodeURIComponent(b.token)}`,
          typeLabel: t ? t.label : b.type, whenText: fmtLagos(b.slot_start), modeLabel: MODES[b.mode] || b.mode,
          feeText: t ? feeText(b.type) : '', topic: b.topic
        }),
        replyTo: { email: 'info@awalglobal.com.ng', name: 'Awal Global Consults' }
      });
      await env.DB.prepare('UPDATE bookings SET reminded_at = ?2 WHERE id = ?1').bind(b.id, nowIso).run();
    } catch (err) {
      console.error('daily job: booking reminder failed:', err && err.message);
    }
  }
  const consultations = soonRows.map(b => ({
    reference: fmtLagos(b.slot_start, { weekday: 'short', month: 'short' }), name: b.full_name,
    url: b.case_id ? caseUrl(b.case_id) : `${SITE_URL}/admin/`,
    detail: `${(CONSULT_TYPES[b.type] || {}).short || b.type} · ${MODES[b.mode] || b.mode} · ${b.phone || b.email}${b.status === 'awaiting_payment' ? ' · awaiting payment' : ''}`
  }));

  // ── 1c. Weekly guides email to subscribers ────────────────────
  let digest = null;
  try {
    digest = await sendDigest(env, request, now);
  } catch (err) {
    console.error('daily job: digest error:', err && err.message);
  }

  // ── 2. Summary ────────────────────────────────────────────────
  const weekAhead = new Date(now.getTime() + 7 * DAY_MS).toISOString();
  const dayAgo = new Date(now.getTime() - DAY_MS).toISOString();
  const [newRes, progressRes, followRes, countRes, retentionRes] = await env.DB.batch([
    env.DB.prepare(
      `SELECT c.id, c.reference, c.kind, c.services, c.created_at, cl.full_name FROM cases c JOIN clients cl ON cl.id = c.client_id
       WHERE c.status = 'new' ORDER BY c.created_at`),
    env.DB.prepare(
      `SELECT c.id, c.reference, c.status, c.status_changed_at, cl.full_name FROM cases c JOIN clients cl ON cl.id = c.client_id
       WHERE c.kind = 'application' AND c.status IN ('paid', 'filed', 'approved') ORDER BY c.status_changed_at`),
    env.DB.prepare(
      `SELECT c.id, c.reference, c.follow_up_at, c.follow_up_note, cl.full_name FROM cases c JOIN clients cl ON cl.id = c.client_id
       WHERE c.follow_up_at IS NOT NULL AND c.follow_up_at <= ?1 ORDER BY c.follow_up_at`).bind(weekAhead),
    env.DB.prepare(
      "SELECT SUM(kind = 'application') AS applications, SUM(kind = 'enquiry') AS enquiries FROM cases WHERE created_at >= ?1").bind(dayAgo),
    env.DB.prepare(
      'SELECT COUNT(*) AS n FROM cases WHERE retain_until IS NOT NULL AND retain_until < ?1 AND legal_hold = 0 AND purged_at IS NULL').bind(nowIso)
  ]);

  const newCases = (newRes.results || []).map(c => {
    const days = daysSince(c.created_at, now);
    return {
      reference: c.reference, name: c.full_name, url: caseUrl(c.id),
      detail: `${c.services || (c.kind === 'enquiry' ? 'Enquiry' : 'Application')} · ${days === 0 ? 'received in the last day' : `waiting ${days} day${days === 1 ? '' : 's'}`}${days >= 1 && c.kind === 'application' ? ': quote was promised within 1 working day' : ''}`
    };
  });
  const waiting = waitingRows.map(c => {
    const days = daysSince(c.status_changed_at, now);
    return {
      reference: c.reference, name: c.full_name, url: caseUrl(c.id),
      detail: `${statusInfo('application', c.status).label} ${days} day${days === 1 ? '' : 's'} ago · ${c.reminders} reminder${c.reminders === 1 ? '' : 's'} sent${c.reminders >= REMINDER_DAYS.length ? ': time to call them' : ''}`
    };
  });
  const inProgress = (progressRes.results || []).map(c => {
    const days = daysSince(c.status_changed_at, now);
    return {
      reference: c.reference, name: c.full_name, url: caseUrl(c.id),
      detail: `${statusInfo('application', c.status).label} for ${days} day${days === 1 ? '' : 's'}${c.status === 'filed' && days >= STALE_IN_PROGRESS_DAYS ? ': check with the agency' : ''}`
    };
  });
  const followUps = (followRes.results || []).map(c => ({
    reference: c.reference, name: c.full_name, url: caseUrl(c.id),
    detail: `${new Date(c.follow_up_at) <= now ? 'Overdue since' : 'Due'} ${shortDate(c.follow_up_at)}${c.follow_up_note ? ` · ${c.follow_up_note}` : ''}`
  }));
  const counts = { applications: (countRes.results || [])[0]?.applications || 0, enquiries: (countRes.results || [])[0]?.enquiries || 0 };
  const retentionDue = (retentionRes.results || [])[0]?.n || 0;

  const hasNews = consultations.length || digest || newCases.length || followUps.length || waiting.length || inProgress.length || remindersSent.length || retentionDue
    || counts.applications || counts.enquiries;
  let summarySent = false;
  if (hasNews) {
    const dateLabel = new Date(now).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long' });
    const html = dailySummaryEmail({ dateLabel, counts, newCases, waiting, inProgress, followUps, remindersSent, retentionDue, consultations, digest, dashboardUrl: `${SITE_URL}/admin/` });
    for (const email of adminEmails(env)) {
      try {
        await sendBrevoEmail(env, {
          to: { email },
          subject: `Daily summary: ${newCases.length} need${newCases.length === 1 ? 's' : ''} a reply, ${followUps.length} follow-up${followUps.length === 1 ? '' : 's'} due`,
          html
        });
        summarySent = true;
      } catch (err) {
        console.error('daily job: summary email failed:', err && err.message);
      }
    }
  }

  // ── 3. Backup ─────────────────────────────────────────────────
  let backup = null;
  try {
    backup = await backupDatabase(env, runDate);
  } catch (err) {
    console.error('daily job: backup failed:', err && err.message);
  }

  const detail = {
    backupBytes: backup ? backup.bytes : null, backupsRemoved: backup ? backup.removed : 0,
    remindersSent: remindersSent.length, newCases: newCases.length, followUps: followUps.length,
    waiting: waiting.length, inProgress: inProgress.length, retentionDue, summarySent,
    consultations: consultations.length, digestSent: digest ? digest.sent : 0
  };
  await env.DB.batch([
    env.DB.prepare("UPDATE job_runs SET detail = ?2 WHERE job = 'daily' AND run_date = ?1").bind(runDate, JSON.stringify(detail)),
    env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, ?2, 'job.daily', 'job', ?3, ?4, ?5)")
      .bind(nowIso, ACTOR, runDate, JSON.stringify(detail), ip)
  ]);
  return { ran: true, runDate, ...detail };
}
