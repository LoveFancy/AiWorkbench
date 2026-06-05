#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# ============================================================
# 部署环境约定
# ============================================================
#   JDK:  /app/workmate/jdk17（可通过 --java-home 覆盖）
#   配置: config/application-<profile>.yaml
#   日志: logs/server.log
#   PID:  logs/server.pid
# ============================================================
JAVA_HOME_DEFAULT="/app/workmate/jdk17"

PROFILE=""
PORT=""
JAVA_HOME_OVERRIDE=""

usage() {
  cat <<'EOF'
Usage: start.sh <profile> [port] [--java-home <path>]
       start.sh <profile> [--port <port>] [--java-home <path>]

参数（位置）:
  profile               Spring profile 名称（prod / uat / dev / localdev）
  port                  （可选）服务端口，默认 6173

参数（命名）:
  --port <port>         指定端口
  --java-home <path>    JDK 安装目录（默认 /app/workmate/jdk17）
  --help                帮助

示例:
  bin/start.sh prod                   启动 prod 环境
  bin/start.sh uat                    启动 uat 环境
  bin/start.sh localdev               本地开发
  bin/start.sh prod 8080              prod 环境，端口 8080
  bin/start.sh prod --port 8080       同上（命名参数）
EOF
  exit 0
}

# ===== 解析参数：位置参数 + 命名参数混合 =====
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="$2"; shift 2 ;;
    --port=*)
      PORT="${1#*=}"; shift ;;
    --java-home)
      JAVA_HOME_OVERRIDE="$2"; shift 2 ;;
    --java-home=*)
      JAVA_HOME_OVERRIDE="${1#*=}"; shift ;;
    --help|-h)
      usage ;;
    --*)
      echo "[ERROR] Unknown option: $1"; usage ;;
    *)
      if [ -z "$PROFILE" ]; then
        PROFILE="$1"
      elif [ -z "$PORT" ] && [[ "$1" =~ ^[0-9]+$ ]]; then
        PORT="$1"
      else
        echo "[ERROR] Unexpected argument: $1"
        usage
      fi
      shift
      ;;
  esac
done

# ===== 加载 .env =====
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# ===== 设置 Spring profile =====
if [ -n "$PROFILE" ]; then
  export SPRING_PROFILES_ACTIVE="$PROFILE"
fi

# ===== JDK 路径 =====
JAVA_HOME_DIR="${JAVA_HOME_OVERRIDE:-$JAVA_HOME_DEFAULT}"
JAVA_BIN="${JAVA_HOME_DIR}/bin/java"

if [ ! -x "$JAVA_BIN" ]; then
  echo "[ERROR] Java not found: ${JAVA_BIN}"
  echo "        默认路径: ${JAVA_HOME_DEFAULT}"
  echo "        可通过 --java-home <path> 覆盖"
  exit 1
fi

# ===== 端口 =====
PORT="${PORT:-${PORT_ENV:-6173}}"

# ===== 校验 profile 文件 =====
if [ -n "$SPRING_PROFILES_ACTIVE" ]; then
  FOUND=""
  for ext in yaml yml; do
    F="config/application-${SPRING_PROFILES_ACTIVE}.${ext}"
    [ -f "$F" ] && FOUND="$F" && break
  done
fi

echo "=============================================="
echo "  WorkMate Server"
echo "  JDK:      ${JAVA_HOME_DIR}"
echo "  Port:     ${PORT}"
[ -n "$SPRING_PROFILES_ACTIVE" ] && echo "  Profile:  ${SPRING_PROFILES_ACTIVE}"
[ -n "$FOUND" ] && echo "  Config:   ${FOUND}"
[ -z "$FOUND" ] && [ -n "$SPRING_PROFILES_ACTIVE" ] && echo "  Config:   (not found, will fallback to application.yml)"
echo "=============================================="

# ===== 健康检查 =====
if curl -sf "http://localhost:${PORT}/workmate/health" > /dev/null 2>&1; then
  echo "[INFO] Already running on port ${PORT}"
  exit 0
fi

# ===== 找到主 jar =====
JAR_FILE=$(ls *.jar 2>/dev/null | head -1)
if [ -z "$JAR_FILE" ]; then
  echo "[ERROR] No jar found in $PROJECT_DIR"
  exit 1
fi

mkdir -p logs

# ===== 拼接参数 =====
JAVA_OPTS=()
[ -n "$SPRING_PROFILES_ACTIVE" ] && JAVA_OPTS+=("--spring.profiles.active=${SPRING_PROFILES_ACTIVE}")

# ===== 启动 =====
nohup "${JAVA_BIN}" \
  -cp "${JAR_FILE}:lib/*:config" \
  com.workmate.server.WorkmateServerApplication \
  "${JAVA_OPTS[@]}" \
  > logs/server.log 2>&1 &

SERVER_PID=$!
echo "$SERVER_PID" > logs/server.pid

echo "Started (PID: ${SERVER_PID})"
echo "  Log: ${PROJECT_DIR}/logs/server.log"
echo "  PID: ${PROJECT_DIR}/logs/server.pid"
