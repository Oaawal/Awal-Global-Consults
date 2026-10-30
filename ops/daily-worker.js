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
  },

  // Opening the Worker's address with ?key=<CRON_SECRET> runs the job now (it
  // still only runs once per day); without the key it just says it is alive.
  async fetch(request, env) {
    const key = new URL(request.url).searchParams.get('key');
    if (!key || key !== env.CRON_SECRET) {
      return new Response('awal-daily is running. It starts the daily job at 8am Lagos time.');
    }
    const result = await run(env);
    return new Response(`Daily job response: ${result.status} ${result.body}`);
  }
};

async function run(env) {
  const res = await fetch('https://awalglobal.pages.dev/cron/daily', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` }
  });
  const body = await res.text();
  console.log('daily job:', res.status, body);
  return { status: res.status, body };
}
