#!/usr/bin/env bash
set -e

echo "Stopping WorkMate Server..."

PID=""

# 优先从 pidfile 读取
if [ -f logs/server.pid ]; then
  PID=$(cat logs/server.pid 2>/dev/null || true)
  rm -f logs/server.pid
fi

# 兜底：ps 查找主类进程
if [ -z "$PID" ] || ! ps -p "$PID" > /dev/null 2>&1; then
  PID=$(ps aux | grep 'com.workmate.server.WorkmateServerApplication' | grep -v grep | awk '{print $2}' | head -1)
fi

if [ -z "$PID" ]; then
  echo "No running WorkMate Server process found."
  exit 0
fi

echo "Killing PID: $PID"
kill "$PID" 2>/dev/null || true
sleep 2

if ps -p "$PID" > /dev/null 2>&1; then
  echo "Force killing PID: $PID"
  kill -9 "$PID" 2>/dev/null || true
fi
echo "WorkMate Server stopped."
