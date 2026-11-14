#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"

RUN=data/run

stop() {
  local name=$1 signal=$2
  local file="$RUN/$name.pid"
  if [ ! -f "$file" ] || ! kill -0 "$(cat "$file")" 2>/dev/null; then
    echo "$name not running"
    rm -f "$file"
    return
  fi
  local pid
  pid=$(cat "$file")
  kill "-$signal" "$pid"
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.5
  done
  kill -0 "$pid" 2>/dev/null && kill -9 "$pid"
  rm -f "$file"
  echo "$name stopped"
}

stop frontend TERM
stop engine INT

pkill -f "data/cache/mediamtx.yml" 2>/dev/null && echo "mediamtx leftover stopped"
pkill -f "engine.inference.server" 2>/dev/null && echo "inference server leftover stopped"

if [ "${1:-}" = "--all" ] && command -v docker >/dev/null; then
  docker compose stop qdrant >/dev/null 2>&1 && echo "qdrant stopped"
else
  echo "qdrant left running (./stop.sh --all stops it too)"
fi
