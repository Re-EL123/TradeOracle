#!/usr/bin/env bash
# Bootstrap a fresh dev machine / VM for TradeOracle.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "==> TradeOracle bootstrap from ${ROOT}"

echo "==> Python venv + deps"
python3 -m venv "${ROOT}/.venv"
"${ROOT}/.venv/bin/pip" install -q --upgrade pip
"${ROOT}/.venv/bin/pip" install -q -r "${ROOT}/trading-engine/requirements.txt" pytest

echo "==> Node API deps"
if command -v npm >/dev/null 2>&1; then
  (cd "${ROOT}/api" && npm install --silent)
else
  echo "    npm not found — skipping api install"
fi

echo "==> Run tests"
(cd "${ROOT}" && "${ROOT}/.venv/bin/python" -m pytest tests -q)

echo "==> Done."
echo "    Engine:  cd trading-engine && ../.venv/bin/python -m main"
echo "    API:     cd api && npm run dev"
echo "    Frontend: open frontend/index.html (or any static server)"
