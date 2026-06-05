#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "Starting WorkMate Server..."

# 加载 .env（如果存在）
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

PORT="${PORT:-6173}"

# 检查是否已经在运行
if curl -sf "http://localhost:${PORT}/workmate/health" > /dev/null 2>&1; then
  echo "WorkMate Server is already running on port ${PORT}"
  exit 0
fi

# 找到项目 jar
JAR_FILE=$(ls *.jar 2>/dev/null | head -1)
if [ -z "$JAR_FILE" ]; then
  echo "Error: No jar file found in $PROJECT_DIR"
  exit 1
fi

# 确保 logs 目录存在
mkdir -p logs

nohup java -cp "${JAR_FILE}:lib/*:config" \
  com.workmate.server.WorkmateServerApplication \
  > logs/server.log 2>&1 &

echo "WorkMate Server started on port ${PORT} (PID: $!)"
echo "Log: ${PROJECT_DIR}/logs/server.log"
