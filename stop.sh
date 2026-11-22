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

if pkill -f "data/cache/mediamtx.yml" 2>/dev/null; then echo "mediamtx leftover stopped"; fi
