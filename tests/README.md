# Tests

End-to-end tests run the real website code locally (Cloudflare's `wrangler pages dev`) against a fresh
database built from `db/schema.sql`. Stand-in servers take the place of Brevo (`mock-brevo3.js`, records
emails to `emails.jsonl`), Meta WhatsApp and Anthropic (`mock-wa.js`, records to `wa.log`), so nothing real
is sent and nothing is billed.

## Set up once

```
cd tests && npm install && npx playwright install chromium && cd ..
sudo apt-get install -y poppler-utils unzip     # pdftotext for the PDF checks
```

## Run

```
tests/e2e/run.sh              # every suite (about 10 minutes)
tests/e2e/run.sh svc-e2e      # one suite
STATE=/tmp/agc tests/e2e/run.sh   # keep state and screenshots in a folder you choose
```

Each suite prints PASS/FAIL lines; the script ends with a total and exits non-zero on any failure.
Screenshots and outputs are left in the state folder.

## What the suites cover

| Suite | Covers |
|---|---|
| intake-e2e, biz-e2e | Application form: quick quote vs full application, business details, people |
| upload-e2e, docfix-e2e, past-e2e, import-e2e | Client upload links, replace/remove with archive, past clients and their documents |
| bill-e2e, billpdf-e2e, disc-e2e, payonly, pp-e2e, est-e2e | Quotations, invoices, receipts, letterhead PDFs, discounts, part payments |
| svc-e2e, miss-ptr | Per-service progress, dependencies, client emails, "still needed" |
| bounce-e2e, tools-e2e, app-e2e | Email bounces, free tools, dashboard app and notifications |
| fp-e2e | Filing pack, zip and photo shrinking, extension API keys, delivered documents, tracking page |
| filler-test, panel-test | Filing assistant: page filler on a mock portal, extension loads and talks to the API |
| wa-test, wa-menu-test | WhatsApp webhook: signatures, retries, AI tools, menu flow, agent button, failure logging |

Not covered yet: drawing a signature on the form and the passport step in the browser. The old suites for these
(`legacy/sig-e2e.js`, `legacy/people-e2e.js`, `legacy/pp-e2e.js`) follow the form's earlier step order and need
updating for the "Start the full application" choice and the business-details step.

Known quirks: `intake-e2e` "still one case" and `docfix-e2e` "non-document file refused" fail on wording/counting
details of the test itself; tests sign in as `info@awalglobal.com.ng` (the default admin); a few older suites depend on
data created earlier in the same run, so run the full list in order when in doubt.
