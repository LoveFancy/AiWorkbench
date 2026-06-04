#!/usr/bin/env bash
set -e

echo "Stopping WorkMate Server..."

PID=$(ps aux | grep 'com.workmate.server.WorkmateServerApplication' | grep -v grep | awk '{print $2}')

if [ -z "$PID" ]; then
  echo "No running WorkMate Server process found."
else
  echo "Killing PID: $PID"
  kill $PID 2>/dev/null || true
  sleep 2

  if ps -p $PID > /dev/null 2>&1; then
    echo "Force killing PID: $PID"
    kill -9 $PID 2>/dev/null || true
  fi
  echo "WorkMate Server stopped."
fi
