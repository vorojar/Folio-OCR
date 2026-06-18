#!/usr/bin/env bash
set -euo pipefail

python3 -m compileall server.py folio_ocr
python3 -m unittest discover -s tests

if command -v node >/dev/null 2>&1; then
  node --check folio_ocr/script.js
else
  echo "node not found; skipped script.js syntax check"
fi
