/**
 * Is the daily job still running? It is started each morning by a separate Worker
 * (ops/daily-worker.js). If that Worker stops, nothing inside the daily job can notice,
 * so this check runs from elsewhere: every dashboard visit and every WhatsApp delivery.
 * When the last run is more than LATE_HOURS old, the admins get ONE alert per day
 * (email + phone notification) and the dashboard shows a red banner.
 */
import { adminEmails } from './admin-auth.js';
import { sendBrevoEmail } from './brevo.js';
import { securityAlertEmail } from './email-templates.js';
import { notifyAdmins } from './webpush.js';
import { SITE_URL } from './cases.js';

const LATE_HOURS = 26;

export async function dailyJobHealth(env, { alert = false, now = new Date() } = {}) {
  if (!env.DB) return { late: false };
  const row = await env.DB.prepare("SELECT MAX(ran_at) AS last FROM job_runs WHERE job = 'daily'").first();
  const last = row && row.last;
  if (!last) return { late: false, last: null }; // never run (new install): nothing to compare with
  const hours = (now - new Date(last)) / 3600000;
  const late = hours > LATE_HOURS;
  if (late && alert) {
    const today = now.toISOString().slice(0, 10);
    const sent = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'job_late_alerted'").first();
    if (!sent || sent.value !== today) {
      await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('job_late_alerted', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .bind(today, now.toISOString()).run();
      const html = securityAlertEmail({
        title: 'The daily job has not run',
        intro: `The morning job last ran ${Math.round(hours)} hours ago. Until it runs again there are no client reminders, morning summaries, backups or clean-up.`,
        rows: [['Last run', new Date(last).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' }) + ' (Lagos)']],
        action: 'In Cloudflare, open Workers & Pages → awal-daily: check its cron trigger and that its CRON_SECRET matches the website\'s. Opening the Worker\'s address with ?key=<CRON_SECRET> runs the job straight away. See ops/RUNBOOK.md, section 6.',
        buttonUrl: `${SITE_URL}/admin/`, buttonLabel: 'Open dashboard'
      });
      for (const to of adminEmails(env)) {
        await sendBrevoEmail(env, { to: { email: to }, subject: 'Alert: the daily job has not run', html }).catch(err => console.error('job alert email failed:', err && err.message));
      }
      await notifyAdmins(env, { title: 'Daily job has not run', body: `Last run ${Math.round(hours)} hours ago. Reminders and backups are paused.`, url: `${SITE_URL}/admin/`, tag: 'job-late' });
    }
  }
  return { late, last, hours };
}
