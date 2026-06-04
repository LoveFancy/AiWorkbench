# 打包 workmate-server 为可部署的压缩包
# 用法: powershell -ExecutionPolicy Bypass -File scripts/pack.ps1 [版本号] [lite]
# 示例:
#   powershell -File scripts/pack.ps1 1.0.0        # 完整包（含 node_modules，适用于同架构）
#   powershell -File scripts/pack.ps1 1.0.0 lite    # 精简包（不含 node_modules，适用于跨架构如 ARM）

param(
    [string]$Version = "",
    [string]$Mode = ""
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not $Version) {
    $pkg = Get-Content "$ProjectDir\package.json" -Raw | ConvertFrom-Json
    $Version = $pkg.version
}

$IsLite = ($Mode -eq "lite")
$OutputName = if ($IsLite) { "workmate-server-$Version-lite" } else { "workmate-server-$Version" }
$DistDir = "$ProjectDir\dist-pack"

Write-Host "=== Pack WorkMate Server v$Version ($($IsLite ? 'lite' : 'full')) ===" -ForegroundColor Cyan

# 1. Build
Write-Host "[1/5] Prisma generate..." -ForegroundColor Yellow
Push-Location $ProjectDir
npx prisma generate

Write-Host "[2/5] Build TypeScript..." -ForegroundColor Yellow
npm run build

Write-Host "[3/5] Build admin frontend..." -ForegroundColor Yellow
Push-Location "$ProjectDir\admin"
npm install --silent
npm run build
Pop-Location

# 2. Create pack directory
Write-Host "[4/5] Collect files..." -ForegroundColor Yellow
if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force }
$OutPath = "$DistDir\$OutputName"
New-Item -ItemType Directory -Path $OutPath -Force | Out-Null

# Copy files
Copy-Item -Recurse "$ProjectDir\dist" "$OutPath\dist"
Copy-Item -Recurse "$ProjectDir\prisma" "$OutPath\prisma"
if (-not $IsLite) {
    Copy-Item -Recurse "$ProjectDir\node_modules" "$OutPath\node_modules"
}
Copy-Item -Recurse "$ProjectDir\admin\dist" "$OutPath\public\admin"
Copy-Item "$ProjectDir\package.json" $OutPath
Copy-Item "$ProjectDir\package-lock.json" $OutPath -ErrorAction SilentlyContinue
Copy-Item "$ProjectDir\.env.example" "$OutPath\.env.example"

# Create start.sh (Linux)
if ($IsLite) {
    $startShLines = @(
        '#!/usr/bin/env bash'
        'set -e'
        'if [ ! -f .env ]; then'
        '  echo "Error: .env file not found"'
        '  echo "Run: cp .env.example .env && vi .env"'
        '  exit 1'
        'fi'
        ''
        '# Install dependencies (first run or cross-platform deploy)'
        'if [ ! -d node_modules ]; then'
        '  echo "Installing dependencies..."'
        '  npm install --production'
        '  npx prisma generate'
        'fi'
        ''
        'echo "Running database migrations..."'
        'npx prisma migrate deploy'
        'echo "Starting WorkMate Server..."'
        'node dist/index.js'
    )
} else {
    $startShLines = @(
        '#!/usr/bin/env bash'
        'set -e'
        'if [ ! -f .env ]; then'
        '  echo "Error: .env file not found"'
        '  echo "Run: cp .env.example .env && vi .env"'
        '  exit 1'
        'fi'
        'echo "Running database migrations..."'
        'npx prisma migrate deploy'
        'echo "Starting WorkMate Server..."'
        'node dist/index.js'
    )
}
Set-Content -Path "$OutPath\start.sh" -Value $startShLines -Encoding UTF8

# Create start.ps1 (Windows)
$startPs1Lines = @(
    'if (-not (Test-Path .env)) {'
    '  Write-Host "Error: .env not found" -ForegroundColor Red'
    '  Write-Host "Run: Copy-Item .env.example .env, then edit it"'
    '  exit 1'
    '}'
    'if (-not (Test-Path node_modules)) {'
    '  Write-Host "Installing dependencies..." -ForegroundColor Yellow'
    '  npm install --production'
    '  npx prisma generate'
    '}'
    'Write-Host "Running database migrations..." -ForegroundColor Yellow'
    'npx prisma migrate deploy'
    'Write-Host "Starting WorkMate Server..." -ForegroundColor Yellow'
    'node dist/index.js'
)
Set-Content -Path "$OutPath\start.ps1" -Value $startPs1Lines -Encoding UTF8

# 3. Compress
Write-Host "[5/5] Compressing..." -ForegroundColor Yellow
Push-Location $DistDir
Compress-Archive -Path $OutputName -DestinationPath "$OutputName.zip" -Force
Pop-Location

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Output: $DistDir\$OutputName.zip"
Get-Item "$DistDir\$OutputName.zip" | Select-Object Length
Write-Host ""
Write-Host "=== Deploy steps ===" -ForegroundColor Cyan
if ($IsLite) {
    Write-Host "1. Upload and extract on target machine (ARM/Kylin etc.)"
    Write-Host "2. Copy .env.example to .env, edit config"
    Write-Host "3. bash start.sh  (will auto npm install on target)"
} else {
    Write-Host "1. Upload and extract on target machine (same architecture)"
    Write-Host "2. Copy .env.example to .env, edit config"
    Write-Host "3. Linux: bash start.sh / Windows: powershell -File start.ps1"
}
