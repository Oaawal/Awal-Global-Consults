# Runbook: run, roll back, restore, fix

One page for whoever looks after awalglobal.com.ng. The setup record (what each Cloudflare
piece is) is in `ops/README.md`. This folder is not publicly reachable.

## 1. What runs where

| Piece | Where | Notes |
|---|---|---|
| Website + dashboard + APIs | Cloudflare Pages project `awalglobal` | Deploys automatically from `main` on GitHub (Oaawal/Awal-Global-Consults) |
| Database | Cloudflare D1 `awal-cases` | Schema `db/schema.sql`, changes `db/migrations/` |
| Client files + nightly DB backup | Cloudflare R2 `awal-documents` (binding `DOCS`) | Private. `case/<id>/…` files, `backups/YYYY-MM-DD.json`, `wa/chat/…` WhatsApp chats |
| Second copy of files + DB backup | R2 binding `DOCS_BACKUP` (if set) | Dashboard → Records → Backups shows whether it is on |
| Daily job trigger | Worker `awal-daily` (`ops/daily-worker.js`), cron 07:00 UTC | Calls `POST /cron/daily` |
| Email | Brevo | `BREVO_API_KEY` |
| WhatsApp | Meta WhatsApp Cloud API, number 0708 227 5885 (phone number ID 1289545104233657, WABA 1588064886013001) | Webhook `/whatsapp/webhook`, set as a phone-number override |
| Filing assistant | Chrome extension, `ops/filing-extension/` | Zip in `downloads/tools/` (rebuild with `ops/filing-extension/build.sh`) |

## 2. Secrets and settings (names only, values live in Cloudflare)

Pages project → Settings → Variables and Secrets → **Production**. A change takes effect after the next deployment.

`BREVO_API_KEY`, `CRON_SECRET` (same value on `awal-daily`), `TURNSTILE_SECRET_KEY`, `ADMIN_EMAILS` (optional),
`WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `ANTHROPIC_API_KEY` (optional: turns on WhatsApp AI),
`WA_BOT_ENABLED` (`0` pauses all bot replies), `WA_AI_ENABLED` (`0` keeps the menu even with an AI key).
Never put a secret value in the repository.

## 3. Deploy and roll back

- **Deploy:** push to `main`. Cloudflare builds in about a minute. Check https://awalglobal.com.ng and `/admin`.
- **Roll back fast (no code needed):** Cloudflare → Workers & Pages → `awalglobal` → Deployments →
  the last good deployment → ⋯ → **Rollback to this deployment**. The site switches back in seconds.
- **Then fix in code:** `git revert <bad commit>` on `main` and push, so the next deploy does not bring the problem back.
- Database changes are additive only (new tables/columns). A rollback of the code never needs a database rollback.

## 4. Restore the database

First choice for a recent mistake: **D1 Time Travel** (point-in-time restore, last few weeks):
`npx wrangler d1 time-travel info awal-cases` then `npx wrangler d1 time-travel restore awal-cases --timestamp <ISO time>`.

From a nightly backup (rehearsed 16 Nov 2026 on a local copy: every table matched, signing key intact):

1. Download the backup: `npx wrangler r2 object get awal-documents/backups/YYYY-MM-DD.json --remote --file backup.json`
2. Make SQL: `node ops/restore/restore-backup.mjs backup.json > restore.sql` (skips, with a warning, columns the schema does not have)
3. Create a NEW database, never overwrite the live one: `npx wrangler d1 create awal-cases-restore`
4. `npx wrangler d1 execute awal-cases-restore --remote --file db/schema.sql -y`, then `--file restore.sql -y`
5. Check counts (cases, clients, documents) against the dashboard, then point the Pages `DB` binding at the new
   database and redeploy. Keep the old one until you are sure.

Restored: all case data, billing, bookings, subscribers, the audit log and `app_settings` (the key that signs client
links, so links already sent keep working). Not restored: sign-in codes and sessions (everyone signs in again).

## 5. Restore client files

Files are copied nightly to `DOCS_BACKUP` under the same keys. To bring one back: download it from the backup
bucket and upload it to `awal-documents` under the same key (Cloudflare → R2 → bucket → object). A whole-bucket
restore = copy every object back (e.g. `rclone sync` between the two buckets).

## 6. When the dashboard says "The daily job has not run"

You also get one email that day. Open Cloudflare → Workers & Pages → `awal-daily`: check the cron trigger is
there and the logs. `401` = the two `CRON_SECRET` values differ; `503` = the website has no `CRON_SECRET`.
Run it now by opening the Worker's address with `?key=<CRON_SECRET>`. It runs at most once per Lagos day.

## 7. WhatsApp

- **Pause the bot:** set `WA_BOT_ENABLED` = `0`, redeploy. Messages still arrive in WhatsApp Manager but get no reply.
- **Failed messages:** Dashboard → Activity → filter **WhatsApp**; the morning summary counts them.
- **Webhook check:** `https://awalglobal.com.ng/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=ok`
  must answer `ok`.
- **Re-point the number to the website** (with a token in the environment):
  `POST https://graph.facebook.com/v21.0/1289545104233657` body
  `{"webhook_configuration":{"override_callback_uri":"https://awalglobal.com.ng/whatsapp/webhook","verify_token":"<WHATSAPP_VERIFY_TOKEN>"}}`
- **Rotate the token:** create a new system-user token in Meta Business settings with only `whatsapp_business_messaging`
  and `whatsapp_business_management` on this WhatsApp account, replace `WHATSAPP_TOKEN`, redeploy, then revoke the old one.

## 8. Tests

`tests/e2e/run.sh` runs 25 end-to-end suites against a local copy (stand-in email, WhatsApp and AI servers;
nothing real is sent). Setup and details: `tests/README.md`. Run them before any risky change and after a rollback.

## 9. Suspected data breach

Follow the breach procedure in the Data Protection Pack (Claude Docs, "Awal Global Consults: Data Protection Pack").
In short: contain (rotate the affected secret, roll back, pause the bot), record what happened in the breach log,
assess risk, notify the NDPC within 72 hours where the breach is likely to risk people's rights, and tell affected
clients without undue delay where the risk is high.

## 10. Dashboard mailbox (info@, contact@, abdullateef@)

How it works: Cloudflare Email Routing hands every email for info@ to the **awal-mail** Worker
(`ops/mail-worker.js`). The Worker first forwards it to your usual inbox (FORWARD_TO), then keeps
the original in R2 (`mail/in/...`) and lists it in the `mail_messages` table. The website
(`/cron/mail-in`) reads it, runs the security checks and sends the phone notification.
Sending from the dashboard goes through Brevo as info@ (domain already authenticated there).

Status (20 Nov 2026): live. The table is on the live database; awal-mail is deployed (bindings DB and DOCS,
FORWARD_TO = the Gmail inbox the domain already forwarded to); routing rules send info@, contact@ and abdullateef@
to it; the catch-all still forwards every other address. Redeploy after editing ops/mail-worker.js.

Set up once:
1. Add the table: run `db/migrations/0007_mail.sql` on the live database.
2. Cloudflare > Workers & Pages > Create Worker **awal-mail**, paste `ops/mail-worker.js`, deploy.
3. awal-mail > Settings > Bindings: D1 `DB` (the website's database) and R2 `DOCS` (awal-documents).
4. awal-mail > Settings > Variables: secret `CRON_SECRET` (same value as the website's) and
   text `FORWARD_TO` = the address info@ forwards to today (must be a verified destination).
5. Email > Email Routing > Routing rules: for info@, contact@ and abdullateef@awalglobal.com.ng (create the
   rule if the address is new), set the action to **Send to a Worker** > awal-mail.
6. Send a test email to info@ from your phone: it should arrive in your usual inbox and on /admin/mail.

If something goes wrong: set the info@ rule back to **Send to an email** (your usual inbox). Mail
already received stays in the dashboard. Optional: `MAIL_FROM` on the Pages project changes the
sending address (default info@awalglobal.com.ng).

Security: only Cloudflare's own SPF/DKIM/DMARC result is trusted; lookalike domains, fake "Awal"
names, other Reply-To addresses, deceptive links, bank-detail changes and program attachments are
flagged; email content shows in a sandboxed frame with no scripts and no remote pictures unless asked;
attachments only download as files; program files cannot be sent; 60 emails an hour at most; every
send, download and move is in Activity > Mail. Trash empties itself after 30 days. Erasing a client
erases their emails; a client export includes them.

Sending addresses: info@, contact@ and abdullateef@ (founder) can all send; each has its own designed
signature, edited on Settings > "Sending addresses and signatures" (stored in app_settings
'mail_identities'). Replies go out from the address the client wrote to.

Drafts: the compose page saves to Drafts about a second after you stop typing (and attachments as soon
as they are chosen), so a draft started on the phone opens on the web. Offline, it is kept on the device
and saved when the connection returns.

Spam: forged mail, lookalike domains and fake "Awal" names go straight to Spam, as do blocked senders
(Block on an email; unblock in Settings).

Ticks: ✓ sent, grey ✓✓ delivered, blue ✓✓ opened, from a second Brevo webhook ('brevo_mail_webhook',
created on the first send or by the morning job, posting to /hooks/brevo). "Opened" means pictures
loaded, so it is a strong hint, not proof.

## 11. Authenticator app sign-in

Settings > Authenticator app: scan the QR code with Google Authenticator, Microsoft Authenticator or
Authy, confirm a code, and save the ten recovery codes. Then the sign-in page's "Use your authenticator
app instead" works without email. Each code and recovery code works once; 8 wrong codes in 15 minutes
locks app sign-in for that address; a recovery-code sign-in alerts all admins. Secrets are encrypted with
a key derived from TOTP_KEY (or CRON_SECRET if TOTP_KEY is not set): if you change that secret, every
admin must link their app again (sign in with an emailed code first).
