#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Restarting WorkMate Server..."

bash "$SCRIPT_DIR/stop.sh"
sleep 2

# 透传所有参数给 start.sh（如 --profile prod --port 8080）
bash "$SCRIPT_DIR/start.sh" "$@"
