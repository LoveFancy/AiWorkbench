#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# ============================================================
# JDK 路径（绝对路径启动，不依赖 JAVA_HOME 或 PATH）
# ============================================================
# 部署环境约定：JDK17 安装在 /app/workmate/jdk17。
# 若实际路径不同，可通过 --java-home 参数覆盖，例如：
#   bin/start.sh --profile prod --java-home /opt/jdk17
# ============================================================
JAVA_HOME_DEFAULT="/app/workmate/jdk17"

# ============================================================
# 环境配置加载
# ============================================================
# 优先级（从高到低）：
#   1. 命令行参数：  --profile prod
#   2. 操作系统环境变量：SPRING_PROFILES_ACTIVE=prod
#   3. .env 文件：SPRING_PROFILES_ACTIVE=prod
#   4. 默认值（无 profile）
# ============================================================

PROFILE=""
JAVA_HOME_OVERRIDE=""

usage() {
  cat <<'EOF'
Usage: start.sh [--profile <name>] [--port <port>] [--java-home <path>] [--help]

Options:
  --profile <name>      指定 Spring profile（如 localdev / dev / uat / prod）
  --port <port>         覆盖服务端口（默认 6173）
  --java-home <path>    指定 JDK 安装目录（默认 /app/workmate/jdk17）
  --help                显示帮助

环境变量配置可通过以下三种方式（优先级从高到低）：
  1. 命令行：  ./start.sh --profile prod
  2. 环境变量：SPRING_PROFILES_ACTIVE=prod ./start.sh
  3. .env 文件：在项目根目录创建 .env，写入 SPRING_PROFILES_ACTIVE=prod

JDK 路径默认 /app/workmate/jdk17，使用绝对路径启动 java，不依赖 JAVA_HOME。
若实际部署路径不同，可通过 --java-home 覆盖。

示例：
  ./start.sh --profile localdev   # 加载 config/application-localdev.yml
  ./start.sh --profile prod        # 加载 config/application-prod.yml
  ./start.sh --profile uat --port 8080
  ./start.sh --profile prod --java-home /opt/jdk17
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --profile=*)
      PROFILE="${1#*=}"
      shift
      ;;
    --port)
      export PORT="$2"
      shift 2
      ;;
    --port=*)
      export PORT="${1#*=}"
      shift
      ;;
    --java-home)
      JAVA_HOME_OVERRIDE="$2"
      shift 2
      ;;
    --java-home=*)
      JAVA_HOME_OVERRIDE="${1#*=}"
      shift
      ;;
    --help|-h)
      usage
      ;;
    *)
      echo "[ERROR] Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

# 加载 .env（如果存在）
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# 命令行参数 > 环境变量
if [ -n "$PROFILE" ]; then
  export SPRING_PROFILES_ACTIVE="$PROFILE"
fi

# 解析 JDK 路径（命令行 > 默认值）
JAVA_HOME_DIR="${JAVA_HOME_OVERRIDE:-$JAVA_HOME_DEFAULT}"
JAVA_BIN="${JAVA_HOME_DIR}/bin/java"

if [ ! -x "$JAVA_BIN" ]; then
  echo "[ERROR] Java executable not found or not executable: ${JAVA_BIN}"
  echo "        请通过 --java-home 指定正确的 JDK 安装目录"
  echo "        默认查找: ${JAVA_HOME_DEFAULT}"
  exit 1
fi

# 校验 profile 文件存在性（仅警告，不中断）
if [ -n "$SPRING_PROFILES_ACTIVE" ]; then
  PROFILE_FILE="config/application-${SPRING_PROFILES_ACTIVE}.yml"
  PROFILE_FILE_YAML="config/application-${SPRING_PROFILES_ACTIVE}.yaml"
  if [ ! -f "$PROFILE_FILE" ] && [ ! -f "$PROFILE_FILE_YAML" ]; then
    echo "[WARN] Profile file not found: ${PROFILE_FILE} 或 ${PROFILE_FILE_YAML}"
    echo "       Spring Boot 启动时会回退到 application.yml"
  fi
fi

PORT="${PORT:-6173}"

echo "Starting WorkMate Server..."
echo "  JDK:     ${JAVA_HOME_DIR}"
echo "  Port:    ${PORT}"
if [ -n "$SPRING_PROFILES_ACTIVE" ]; then
  echo "  Profile: ${SPRING_PROFILES_ACTIVE}"
  PROFILE_FILE="config/application-${SPRING_PROFILES_ACTIVE}.yml"
  PROFILE_FILE_YAML="config/application-${SPRING_PROFILES_ACTIVE}.yaml"
  if [ -f "$PROFILE_FILE" ]; then
    echo "  Profile config: ${PROFILE_FILE}"
  elif [ -f "$PROFILE_FILE_YAML" ]; then
    echo "  Profile config: ${PROFILE_FILE_YAML}"
  fi
fi

# 健康检查：已运行则退出
if curl -sf "http://localhost:${PORT}/workmate/health" > /dev/null 2>&1; then
  echo "WorkMate Server is already running on port ${PORT}"
  exit 0
fi

# 找到主 jar
JAR_FILE=$(ls *.jar 2>/dev/null | head -1)
if [ -z "$JAR_FILE" ]; then
  echo "[ERROR] No jar file found in $PROJECT_DIR"
  exit 1
fi

# 确保 logs 目录存在
mkdir -p logs

# 拼接 JVM 参数
JAVA_OPTS=()
if [ -n "$SPRING_PROFILES_ACTIVE" ]; then
  JAVA_OPTS+=("--spring.profiles.active=${SPRING_PROFILES_ACTIVE}")
fi

# 启动（nohup 后台）—— 用绝对路径调 java，不依赖 PATH / JAVA_HOME
nohup "${JAVA_BIN}" \
  -cp "${JAR_FILE}:lib/*:config" \
  com.workmate.server.WorkmateServerApplication \
  "${JAVA_OPTS[@]}" \
  > logs/server.log 2>&1 &

SERVER_PID=$!
echo "$SERVER_PID" > logs/server.pid

echo "WorkMate Server started on port ${PORT} (PID: ${SERVER_PID})"
echo "  Log:    ${PROJECT_DIR}/logs/server.log"
echo "  PID:    ${PROJECT_DIR}/logs/server.pid"
