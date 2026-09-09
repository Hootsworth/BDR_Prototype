#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required. Install it from https://www.python.org/downloads/ and run this file again."
  exit 1
fi

if [ -x ".venv/bin/python" ] && ".venv/bin/python" -c 'import cryptography' >/dev/null 2>&1; then
  PYTHON_BIN="$APP_DIR/.venv/bin/python"
else
  # The local server only requires cryptography. Prefer the system runtime so
  # the launcher remains usable offline and does not block on unrelated dev deps.
  PYTHON_BIN="$(command -v python3)"
fi

if ! "$PYTHON_BIN" -c 'import cryptography' >/dev/null 2>&1; then
  echo "Installing the local server dependency..."
  "$PYTHON_BIN" -m pip install --disable-pip-version-check -q cryptography
fi

if ! "$PYTHON_BIN" -c 'import openpyxl' >/dev/null 2>&1; then
  echo "Installing the local workbook dependency..."
  "$PYTHON_BIN" -m pip install --disable-pip-version-check -q openpyxl
fi

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Add provider credentials there only if you need server-side integrations."
fi

# If port 8001 is already held by a previous instance, terminate it cleanly
if command -v lsof >/dev/null 2>&1; then
  OLD_PID=$(lsof -ti:8001 2>/dev/null || true)
  if [ -n "$OLD_PID" ]; then
    echo "Stopping previous server instance on port 8001 (PID: $OLD_PID)..."
    kill -9 $OLD_PID 2>/dev/null || true
    sleep 0.5
  fi
fi

"$PYTHON_BIN" -c 'import webbrowser; webbrowser.open("http://localhost:8001")' >/dev/null 2>&1 &
echo "GTM Console is starting at http://localhost:8001"
echo "Keep this window open while using the app. Press Ctrl+C to stop it."
exec "$PYTHON_BIN" server.py
