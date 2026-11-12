#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

echo ""
echo " ============================================"
echo "  OrderFlow - starting local server"
echo " ============================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js was not found. Install Node.js 22.13 or newer from https://nodejs.org" >&2
  exit 1
fi

if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  echo "[ERROR] Node.js 22.13 or newer is required. Current version: $(node -v)" >&2
  exit 1
fi

if [ ! -f "node_modules/express/package.json" ]; then
  echo "[SETUP] Installing dependencies for the first run..."
  if ! npm install; then
    echo "[ERROR] Dependency installation failed. Check your internet connection." >&2
    exit 1
  fi
fi

echo "[RUN] Starting OrderFlow at http://127.0.0.1:3000"
echo "      Your browser will open automatically."
echo "      Press Ctrl+C to stop the server."
echo ""

AUTO_OPEN=1 exec node server.js
