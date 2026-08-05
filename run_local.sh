#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required. Install it from https://www.python.org/downloads/ and run this file again."
  exit 1
fi

if [ ! -x ".venv/bin/python" ]; then
  echo "Creating the local Python environment..."
  python3 -m venv .venv
fi

PYTHON_BIN="$APP_DIR/.venv/bin/python"
echo "Checking local dependencies..."
"$PYTHON_BIN" -m pip install --disable-pip-version-check -q -r requirements.txt

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Add provider credentials there only if you need server-side integrations."
fi

"$PYTHON_BIN" -c 'import webbrowser; webbrowser.open("http://localhost:8001")' >/dev/null 2>&1 &
echo "GTM Console is starting at http://localhost:8001"
echo "Keep this window open while using the app. Press Ctrl+C to stop it."
exec "$PYTHON_BIN" server.py
