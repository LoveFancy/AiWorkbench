#!/usr/bin/env bash
# 打包 workmate-server 为可部署的压缩包
# 用法: bash scripts/pack.sh [版本号] [lite]
# 示例:
#   bash scripts/pack.sh 1.0.0        # 完整包（含 node_modules，适用于同架构）
#   bash scripts/pack.sh 1.0.0 lite   # 精简包（不含 node_modules，适用于跨架构如 ARM/Kylin）

set -e

VERSION="${1:-$(node -p 'require("./package.json").version')}"
MODE="${2:-full}"
IS_LITE="$([ "$MODE" = "lite" ] && echo true || echo false)"

if [ "$MODE" = "lite" ]; then
  OUTPUT_NAME="workmate-server-${VERSION}-lite"
else
  OUTPUT_NAME="workmate-server-${VERSION}"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_DIR/dist-pack"

echo "=== Pack WorkMate Server v${VERSION} ($MODE) ==="

# 1. 编译
echo "[1/5] 生成 Prisma Client..."
cd "$PROJECT_DIR"
npx prisma generate

echo "[2/5] 编译 TypeScript..."
npm run build

echo "[3/5] 编译管理台前端..."
cd "$PROJECT_DIR/admin"
npm install --silent
npm run build
cd "$PROJECT_DIR"

# 2. 创建打包目录
echo "[4/5] 组织发布文件..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/$OUTPUT_NAME"

# 复制必要文件
cp -r dist/                "$DIST_DIR/$OUTPUT_NAME/dist/"
cp -r prisma/              "$DIST_DIR/$OUTPUT_NAME/prisma/"
if [ "$MODE" != "lite" ]; then
  cp -r node_modules/      "$DIST_DIR/$OUTPUT_NAME/node_modules/"
fi
cp -r admin/dist/          "$DIST_DIR/$OUTPUT_NAME/public/admin/"
cp package.json            "$DIST_DIR/$OUTPUT_NAME/"
cp -f package-lock.json    "$DIST_DIR/$OUTPUT_NAME/" 2>/dev/null || true
cp .env.example            "$DIST_DIR/$OUTPUT_NAME/.env.example"

# 创建启动脚本
if [ "$MODE" = "lite" ]; then
  cat > "$DIST_DIR/$OUTPUT_NAME/start.sh" <<'START_EOF'
#!/usr/bin/env bash
set -e

if [ ! -f .env ]; then
  echo "Error: .env file not found"
  echo "Run: cp .env.example .env && vi .env"
  exit 1
fi

# Install dependencies (first run or cross-platform deploy)
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install --production
  npx prisma generate
fi

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting WorkMate Server..."
node dist/index.js
START_EOF
else
  cat > "$DIST_DIR/$OUTPUT_NAME/start.sh" <<'START_EOF'
#!/usr/bin/env bash
set -e

if [ ! -f .env ]; then
  echo "Error: .env file not found"
  echo "Run: cp .env.example .env && vi .env"
  exit 1
fi

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting WorkMate Server..."
node dist/index.js
START_EOF
fi
chmod +x "$DIST_DIR/$OUTPUT_NAME/start.sh"

# 3. 压缩
echo "[5/5] Compressing..."
cd "$DIST_DIR"
if command -v tar &> /dev/null; then
  tar -czf "${OUTPUT_NAME}.tar.gz" "$OUTPUT_NAME"
  echo ""
  echo "=== Done ==="
  echo "Output: $DIST_DIR/${OUTPUT_NAME}.tar.gz"
  ls -lh "${OUTPUT_NAME}.tar.gz"
elif command -v zip &> /dev/null; then
  zip -r "${OUTPUT_NAME}.zip" "$OUTPUT_NAME"
  echo ""
  echo "=== Done ==="
  echo "Output: $DIST_DIR/${OUTPUT_NAME}.zip"
  ls -lh "${OUTPUT_NAME}.zip"
else
  echo ""
  echo "=== Done (uncompressed) ==="
  echo "Directory: $DIST_DIR/$OUTPUT_NAME"
fi

echo ""
echo "=== Deploy steps ==="
if [ "$MODE" = "lite" ]; then
  echo "1. Upload and extract on target machine (ARM/Kylin etc.)"
  echo "2. Copy .env.example to .env, edit config"
  echo "3. bash start.sh  (will auto npm install on target)"
else
  echo "1. Upload and extract on target machine (same architecture)"
  echo "2. Copy .env.example to .env, edit config"
  echo "3. bash start.sh"
fi
