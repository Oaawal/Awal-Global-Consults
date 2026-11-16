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
| tools-e2e | The seven free tools |
| fp-e2e | Filing pack, zip and photo shrinking, extension API keys, delivered documents, tracking page |
| filler-test, panel-test | Filing assistant: page filler on a mock portal, extension loads and talks to the API |
| wa-test, wa-menu-test | WhatsApp webhook: signatures, retries, AI tools, menu flow, agent button, failure logging |

Not covered yet (old suites kept in `tests/e2e/legacy/`, to be updated):

- Drawing a signature on the form and the passport step (`sig-e2e`, `people-e2e`, `pp-e2e`): written for the form's
  earlier step order, before the "Start the full application" choice and the business-details step.
- Email bounce alerts and phone notifications (`bounce-e2e`, `app-e2e`): need extra stand-ins for Brevo webhooks
  and a push service.

Tests sign in as `info@awalglobal.com.ng` (the default admin). Some suites use data created by earlier ones in the
same run (`filler-test` and `panel-test` use the case `fp-e2e` makes), so run the full list in order when in doubt.
