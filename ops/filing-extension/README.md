# Awal Filing Assistant (browser extension)

Chrome / Edge side panel that fills agency portals (CAC, SCUML, NRS, NDPC) from a case's
filing pack on the dashboard. It reads only (case list, filing pack, documents) through
`/admin/api/*` with a connection key made at `/admin/extension`, and never presses Submit.

- `awal-filing-assistant/` is the extension (Manifest V3, no build step).
- `build.sh` zips it to `downloads/tools/awal-filing-assistant.zip`, which the dashboard's
  Filing assistant page links to. Bump `version` in manifest.json and run it after any change.

How it fills: "Fill business details" / "Fill person N" fill empty boxes it recognises by
their labels (rules in filler.js) or that it learned. Clicking into a box on the portal and
then clicking a value in the panel fills it and remembers that box for that portal (stored
in the extension only). "Attach" puts a document into an upload box, asking once which box
and remembering it. Photos over the chosen size are shrunk in the panel first.
