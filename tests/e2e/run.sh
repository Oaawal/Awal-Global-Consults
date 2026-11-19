#!/usr/bin/env bash
# Run the end-to-end tests against a local copy of the site (nothing touches the live site,
# real email, WhatsApp or the AI: stand-in servers record what would have been sent).
#
#   tests/e2e/run.sh            # all suites
#   tests/e2e/run.sh fp-e2e     # one suite
#
# Needs: Node 18+, `npm install` in tests/ (wrangler + playwright, then `npx playwright install chromium`),
# poppler-utils (pdftotext) and unzip. Run from the repository root.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
WR="${WRANGLER:-$ROOT/tests/node_modules/.bin/wrangler}"
S="${STATE:-$(mktemp -d /tmp/agc-e2e.XXXX)}"; mkdir -p "$S"
echo "State and screenshots: $S"
cp tests/e2e/fixtures/* "$S/"; : > "$S/emails.jsonl"; : > "$S/wa.log"
printf 'name="agc-e2e"\ncompatibility_date="2025-09-01"\n[[d1_databases]]\nbinding="DB"\ndatabase_name="local-test"\ndatabase_id="local-test"\n' > "$S/wr.toml"
node tests/e2e/prepare.js "$S"
d1() { (cd "$S" && "$WR" d1 execute local-test --local -c wr.toml --persist-to wrstate -y "$@" >/dev/null 2>&1); }
d1 --file "$ROOT/db/schema.sql"

start() { # $1 = extra bindings
  (cd "$S" && node "$ROOT/tests/e2e/mock-brevo3.js" "$S/emails.jsonl" > "$S/mock-brevo.log" 2>&1 &)
  node tests/e2e/mock-wa.js "$S/wa.log" > "$S/mock-wa.out" 2>&1 &
  "$WR" pages dev . --port 8788 --ip 127.0.0.1 --persist-to "$S/wrstate" --d1 DB=local-test --r2 DOCS=awal-documents \
    --binding BREVO_API_KEY=test --binding BREVO_API_BASE=http://127.0.0.1:9911 --binding CRON_SECRET=x \
    --binding WHATSAPP_TOKEN=tok --binding WHATSAPP_APP_SECRET=appsecret --binding WHATSAPP_VERIFY_TOKEN=vtok \
    --binding GRAPH_BASE=http://127.0.0.1:9922 --binding ANTHROPIC_BASE=http://127.0.0.1:9922 $1 \
    --compatibility-date 2025-09-01 > "$S/pages-dev.log" 2>&1 &
  for i in $(seq 1 90); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8788/)" = 200 ] && return 0; sleep 1; done
  echo "Local site did not start; see $S/pages-dev.log"; exit 1
}
stop() { pkill -f "wrangler pages dev" ; pkill -f mock-brevo3.js ; pkill -f mock-wa.js ; sleep 2; } 2>/dev/null

# Order matters: fp-e2e writes the case that filler-test and panel-test use.
MAIN="intake-e2e biz-e2e upload-e2e docfix-e2e past-e2e import-e2e client-e2e bill-e2e rev-e2e billpdf-e2e disc-e2e payonly est-e2e svc-e2e miss-ptr tools-e2e fp-e2e filler-test panel-test wa-test"
NO_AI="wa-menu-test"
ONLY="${1:-}"
pass=0; fail=0; failed=""
run() {
  d1 --command "DELETE FROM admin_login_codes"
  out="$(timeout 400 node "tests/e2e/$1.js" "$S" 2>&1)"; code=$?; echo "$out" > "$S/$1.out"
  p=$(grep -c '^PASS' <<<"$out"); f=$(grep -cE '^(FAIL|ERR)' <<<"$out")
  # A suite that crashes (non-zero exit) with no FAIL line still counts as a failure
  if [ "$code" -ne 0 ] && [ "$f" -eq 0 ]; then f=1; out="$out
ERR suite crashed (exit $code): see $S/$1.out"; fi
  pass=$((pass + p)); fail=$((fail + f)); [ "$f" -gt 0 ] && failed="$failed $1"
  printf '%-14s %3s passed %3s failed\n' "$1" "$p" "$f"; grep -E '^(FAIL|ERR)' <<<"$out" | sed 's/^/    /'
}
start "--binding ANTHROPIC_API_KEY=k"
# One daily run first: some suites (bounce alerts) expect the set-up it does
curl -s -X POST -H "Authorization: Bearer x" http://127.0.0.1:8788/cron/daily > "$S/first-daily.json"
for t in $MAIN; do [ -z "$ONLY" ] || [ "$ONLY" = "$t" ] && run "$t"; done
stop
if [ -z "$ONLY" ] || [ "$ONLY" = "$NO_AI" ]; then : > "$S/wa.log"; start ""; run "$NO_AI"; stop; fi
echo "Total: $pass passed, $fail failed.${failed:+ Suites with failures:$failed}"
[ "$fail" -eq 0 ]
