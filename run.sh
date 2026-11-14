#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

RUN=data/run
mkdir -p "$RUN"

running() { [ -f "$RUN/$1.pid" ] && kill -0 "$(cat "$RUN/$1.pid")" 2>/dev/null; }

if [ ! -x .venv/bin/python ]; then
  echo "No .venv found. Create it first:"
  echo "  uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements-mac.txt"
  exit 1
fi

if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  docker compose up -d qdrant >/dev/null 2>&1 && echo "qdrant    running on :6333"
else
  echo "qdrant    skipped (Docker not running), the baseline matcher falls back to memory"
fi

if running engine; then
  echo "engine    already running (pid $(cat "$RUN/engine.pid"))"
else
  nohup .venv/bin/python -m engine > "$RUN/engine.log" 2>&1 &
  echo $! > "$RUN/engine.pid"
  printf "engine    starting"
  for _ in $(seq 1 300); do
    if ! running engine; then
      echo " failed, see $RUN/engine.log"
      tail -20 "$RUN/engine.log"
      exit 1
    fi
    if curl -s localhost:8000/api/state | grep -q '"status":"running"'; then
      break
    fi
    printf "."
    sleep 1
  done
  echo " running on :8000 (log: $RUN/engine.log)"
fi

if running frontend; then
  echo "frontend  already running (pid $(cat "$RUN/frontend.pid"))"
else
  [ -d frontend/node_modules ] || (cd frontend && npm install --silent)
  (cd frontend && exec nohup node_modules/.bin/vite --port 5173 --strictPort > "../$RUN/frontend.log" 2>&1) &
  echo $! > "$RUN/frontend.pid"
  for _ in $(seq 1 30); do
    curl -s -o /dev/null localhost:5173 && break
    sleep 0.5
  done
  echo "frontend  running on http://localhost:5173 (log: $RUN/frontend.log)"
fi

echo
echo "Open http://localhost:5173 - stop everything with ./stop.sh"
