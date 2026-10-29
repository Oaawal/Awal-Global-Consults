/**
 * "awal-daily" — a tiny Cloudflare Worker whose only job is to start the
 * website's daily job every morning. Paste this into a new Worker in the
 * Cloudflare dashboard, add a cron trigger "0 7 * * *" (07:00 UTC = 8am Lagos),
 * and add a secret named CRON_SECRET with the same value as the website's.
 * All the real work happens in functions/_lib/automation.js on the website.
 */
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  }
};

async function run(env) {
  const res = await fetch('https://awalglobal.pages.dev/cron/daily', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` }
  });
  console.log('daily job:', res.status, await res.text());
}
