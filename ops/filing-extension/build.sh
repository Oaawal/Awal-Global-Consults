#!/bin/sh
# Zip the extension for download from the dashboard.
set -e
cd "$(dirname "$0")"
mkdir -p ../../downloads/tools
rm -f ../../downloads/tools/awal-filing-assistant.zip
zip -qr -X ../../downloads/tools/awal-filing-assistant.zip awal-filing-assistant
echo "built downloads/tools/awal-filing-assistant.zip"
