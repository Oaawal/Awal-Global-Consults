/**
 * "awal-mail": receives email sent to info@, contact@ and abdullateef@awalglobal.com.ng for the dashboard mailbox.
 *
 * Set up (Cloudflare dashboard, once):
 *  1. Workers & Pages > Create > Worker named "awal-mail"; paste this file and deploy.
 *  2. Its Settings > Bindings: D1 database "DB" (the website's database) and
 *     R2 bucket "DOCS" (awal-documents), the same ones the website uses.
 *  3. Its Settings > Variables: text variable FORWARD_TO = the inbox your addresses forward to
 *     today, so a copy still arrives there exactly as before. (No shared secret is needed: the
 *     Worker and the website share a random key kept in the database.)
 *  4. Email > Email Routing > Routing rules: for each address (info@, contact@, abdullateef@), set the
 *     action to "Send to a Worker" > awal-mail. A copy still goes to FORWARD_TO.
 *
 * What it does with each email, in this order:
 *  - forwards it to FORWARD_TO, so your usual inbox keeps working even if anything below fails;
 *  - keeps the original message in private storage (R2) and lists it in the database;
 *  - asks the website to read it, run the security checks and notify you.
 * It never rejects or drops mail.
 */
const MAX_BYTES = 25 * 1024 * 1024;

/** The key this Worker shows the website: random, kept in the shared database, created on first use. */
async function mailInKey(env) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'mail_in_token'").first();
  if (row) return row.value;
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('mail_in_token', ?1, ?2) ON CONFLICT(key) DO NOTHING").bind(token, new Date().toISOString()).run();
  return (await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'mail_in_token'").first()).value;
}

export default {
  async email(message, env, ctx) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    let raw = null;
    try { raw = await new Response(message.raw).arrayBuffer(); } catch (err) { console.error('mail: could not read message', err && err.message); }

    if (env.FORWARD_TO) {
      try { await message.forward(env.FORWARD_TO); }
      catch (err) { console.error('mail: forward failed', err && err.message); }
    }
    if (!raw || !env.DB || !env.DOCS) return;

    try {
      const h = name => (message.headers.get(name) || '').slice(0, 2000);
      const key = `mail/in/${now.slice(0, 7)}/${id}.eml`;
      await env.DOCS.put(key, raw.byteLength > MAX_BYTES ? raw.slice(0, MAX_BYTES) : raw, { httpMetadata: { contentType: 'message/rfc822' } });

      // Only Cloudflare's own result counts; senders can add Authentication-Results headers of their own
      const ar = h('authentication-results');
      const auth = {};
      if (/^\s*mx\.cloudflare\.net\s*;/i.test(ar)) {
        const first = ar.split(/,\s*(?=[\w.-]+\s*;)/)[0];
        for (const k of ['spf', 'dkim', 'dmarc']) { const m = first.match(new RegExp(`\\b${k}=(\\w+)`, 'i')); auth[k] = m ? m[1].toLowerCase() : 'none'; }
      } else { auth.spf = auth.dkim = auth.dmarc = 'unknown'; }

      const ids = s => (String(s).match(/<[^<>\s]+>/g) || []);
      const messageId = ids(h('message-id'))[0] || `<${id}@in.awalglobal.com.ng>`;
      const inReplyTo = ids(h('in-reply-to'))[0] || null;
      const refs = ids(h('references'));
      let threadId = messageId;
      const parentIds = [inReplyTo, ...refs.reverse()].filter(Boolean).slice(0, 10);
      if (parentIds.length) {
        const parent = await env.DB.prepare(`SELECT thread_id FROM mail_messages WHERE message_id IN (${parentIds.map((_, i) => `?${i + 1}`).join(',')}) LIMIT 1`).bind(...parentIds).first();
        if (parent) threadId = parent.thread_id;
      }
      const fromAddr = String(message.from || '').toLowerCase().slice(0, 254);
      const client = await env.DB.prepare('SELECT id FROM clients WHERE lower(email) = ?1 AND anonymised_at IS NULL LIMIT 1').bind(fromAddr).first();

      await env.DB.prepare(
        `INSERT INTO mail_messages (id, direction, folder, mailbox, message_id, in_reply_to, thread_id, from_addr, to_addrs, subject, size_bytes, auth, raw_key, client_id, received_at)
         VALUES (?1, 'in', 'inbox', ?13, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
      ).bind(id, messageId, inReplyTo, threadId, fromAddr, String(message.to || '').toLowerCase().slice(0, 500), h('subject').slice(0, 300),
        message.rawSize || raw.byteLength, JSON.stringify(auth), key, client ? client.id : null, now, String(message.to || '').toLowerCase().slice(0, 254)).run();

      // The website reads the message, runs the security checks and sends the phone notification
      const siteKey = env.CRON_SECRET || await mailInKey(env);
      if (siteKey) {
        ctx.waitUntil(fetch(`${env.SITE_URL || 'https://awalglobal.com.ng'}/cron/mail-in`, {
          method: 'POST', headers: { Authorization: `Bearer ${siteKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
        }).then(r => { if (!r.ok) console.error('mail: website check returned', r.status); }).catch(err => console.error('mail: website check failed', err && err.message)));
      }
    } catch (err) {
      console.error('mail: could not save message', err && err.message);
    }
  },

  async fetch() {
    return new Response('awal-mail is running. It receives email for the Awal dashboard mailbox.');
  }
};
