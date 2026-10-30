# Client records system — setup record

How the website's client intake, dashboard and daily automation are wired
together, so the setup can be checked or rebuilt by someone else if needed.
This folder is not publicly reachable (see `functions/ops/[[path]].js`).

## Cloudflare account pieces

| Piece | Name | Notes |
|---|---|---|
| Pages project | `awalglobal` | Deploys automatically from `main` on GitHub |
| D1 database | `awal-cases` | Western Europe. Tables in `db/schema.sql`; changes in `db/migrations/` |
| R2 bucket | `awal-documents` | Private. Uploaded client documents, one folder per case |
| Worker | `awal-daily` | Cron `0 7 * * *` (8am Lagos). Code in `ops/daily-worker.js` |

## Pages project settings (Settings → Bindings / Variables and Secrets)

| Name | Type | Purpose |
|---|---|---|
| `DB` | D1 binding → `awal-cases` | Client records |
| `DOCS` | R2 binding → `awal-documents` | Uploaded documents |
| `BREVO_API_KEY` | Secret | Sending emails |
| `CRON_SECRET` | Secret | Must match the `awal-daily` Worker's `CRON_SECRET` |
| `ADMIN_EMAILS` | Variable (optional) | Comma-separated dashboard logins; defaults to info@awalglobal.com.ng |
| `TURNSTILE_SECRET_KEY` | Secret (optional) | Bot check on forms; set together with the site key in `assets/js/site.js` |

Changing a variable or secret only takes effect after the next deployment.

## How it fits together

- **Forms** (`functions/submit-kyc.js`, `functions/submit-contact.js`) save each
  submission through `functions/_lib/records.js`, then email you and the client.
  If the database is unreachable, the email still goes out and says so.
- **Dashboard** at `/admin` (`functions/admin/[[path]].js`, pages in
  `functions/_lib/admin-views.js`, look and feel in `functions/_lib/admin-ui.js`):
  sign in with a code emailed to an address in `ADMIN_EMAILS`. Sections:
  Overview, Cases, Clients, Records (retention review, legal holds, client data
  requests, backups) and Activity (the audit log).
- **Daily job** at `POST /cron/daily` (`functions/_lib/automation.js`): client
  reminders, the 8am summary, and a database backup to `backups/YYYY-MM-DD.json`
  in the R2 bucket (kept 30 days, so erased data leaves backups within 30 days). Runs at most once per Lagos day; the
  `job_runs` table shows each run.
- **Tracking page** at `/track` (`functions/track.js`).
- **Audit log**: the `audit_log` table records every sign-in, case view,
  document view, status change, reminder and daily run. It cannot be edited
  or deleted.

## Retention (from the privacy policy)

- Applications: 6 years after the case is closed (covers the 5-year AML minimum).
- Cancelled applications and enquiries: 12 months after last activity.
- Nothing is deleted automatically; a case on legal hold is never deleted.
- Erasing (`functions/_lib/compliance.js`) deletes a case's documents and personal
  details but keeps a stub (reference, service, dates) as a record that it existed.
  Early erasure is only for test or duplicate entries, with the reason logged.
- D1 also keeps its own point-in-time restore history (Time Travel) for recent days.

## If something stops working

- **No 8am summary:** in the `awal-daily` Worker, check Logs. A `401` means the
  two `CRON_SECRET` values differ; a `503` means the website has no `CRON_SECRET`
  (add it, then redeploy). No email also happens on days with nothing to report.
- **Admin email says "Not saved to client records":** check the `DB` and `DOCS`
  bindings on the Pages project, then redeploy.
- **Can't sign in to the dashboard:** codes go to the `ADMIN_EMAILS` addresses
  (or info@awalglobal.com.ng); 5 codes per hour at most, each valid 10 minutes.
