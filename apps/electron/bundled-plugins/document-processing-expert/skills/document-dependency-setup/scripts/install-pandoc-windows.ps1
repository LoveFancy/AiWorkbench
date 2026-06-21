param(
  [string]$DownloadUrl = "https://htpan.htsc.com.cn/l/tF2Jb7",
  [string]$InstallerName = "pandoc-3.9.0.2-windows-x86_64.msi"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[Pandoc Installer] $Message"
}

function Add-UserPathIfMissing {
  param([string]$Directory)

  if (-not (Test-Path $Directory)) {
    return $false
  }

  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ([string]::IsNullOrWhiteSpace($userPath)) {
    $pathItems = @()
  } else {
    $pathItems = $userPath -split ";"
  }

  $alreadyExists = $pathItems | Where-Object {
    $_.TrimEnd("\") -ieq $Directory.TrimEnd("\")
  }

  if (-not $alreadyExists) {
    $newPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $Directory } else { "$userPath;$Directory" }
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Step "已写入用户 PATH: $Directory"
  } else {
    Write-Step "用户 PATH 已包含: $Directory"
  }

  return $true
}

function Refresh-CurrentPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

if ($IsLinux -or $IsMacOS) {
  throw "此脚本仅用于 Windows。macOS 请使用 brew install pandoc，Linux 请使用系统包管理器安装。"
}

try {
  $existing = Get-Command pandoc -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Step "检测到已安装 Pandoc: $($existing.Source)"
    pandoc --version
    exit 0
  }

  $downloadDir = Join-Path $env:TEMP "workmate-pandoc-installer"
  New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
  $installerPath = Join-Path $downloadDir $InstallerName

  Write-Step "开始下载 Pandoc: $DownloadUrl"
  Write-Step "保存到: $installerPath"
  Invoke-WebRequest -Uri $DownloadUrl -OutFile $installerPath

  if (-not (Test-Path $installerPath)) {
    throw "下载安装包失败: $installerPath"
  }

  Write-Step "开始安装 $InstallerName"
  $process = Start-Process msiexec.exe -ArgumentList @("/i", "`"$installerPath`"", "/qn", "/norestart") -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "msiexec 安装失败，退出码: $($process.ExitCode)。请尝试双击 $installerPath 手动安装。"
  }

  $candidateDirs = @(
    (Join-Path $env:LOCALAPPDATA "Pandoc"),
    "C:\Program Files\Pandoc",
    "C:\Program Files (x86)\Pandoc"
  )

  $pathUpdated = $false
  foreach ($dir in $candidateDirs) {
    if (Add-UserPathIfMissing -Directory $dir) {
      $pathUpdated = $true
    }
  }

  if (-not $pathUpdated) {
    Write-Step "未在常见目录找到 Pandoc，请检查安装位置并手动加入用户 PATH。"
    Write-Step "常见目录: $($candidateDirs -join ', ')"
  }

  Refresh-CurrentPath
  $installed = Get-Command pandoc -ErrorAction SilentlyContinue
  if (-not $installed) {
    throw "Pandoc 已安装但当前终端仍无法找到。请重新打开 PowerShell 后运行: pandoc --version"
  }

  Write-Step "Pandoc 安装完成: $($installed.Source)"
  pandoc --version
} catch {
  Write-Error $_.Exception.Message
  Write-Host ""
  Write-Host "手动处理建议:"
  Write-Host "1. 打开下载目录: $downloadDir"
  Write-Host "2. 双击安装包: $InstallerName"
  Write-Host "3. 将 Pandoc 安装目录加入用户 PATH，例如: $env:LOCALAPPDATA\Pandoc"
  Write-Host "4. 重新打开 PowerShell，运行: pandoc --version"
  exit 1
}
