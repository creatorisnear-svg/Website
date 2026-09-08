#!/usr/bin/env bash
# One-click start for macOS / Linux.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org (choose the LTS version), then run this again."
  exit 1
fi

MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 18 ]; then
  echo "Node.js 18 or newer is required (you have $(node -v)). Update at https://nodejs.org"
  exit 1
fi

PORT_TO_OPEN="${PORT:-4317}"
( sleep 1.5
  if command -v open >/dev/null 2>&1; then open "http://127.0.0.1:${PORT_TO_OPEN}/app/"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://127.0.0.1:${PORT_TO_OPEN}/app/"
  fi ) >/dev/null 2>&1 &

node src/server.js
