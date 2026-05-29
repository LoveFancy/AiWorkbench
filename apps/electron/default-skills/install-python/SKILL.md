---
name: install-python
description: 辅助用户在 Windows 系统上安装和修复 Python 环境，包括版本选择、清华镜像下载、静默安装、PATH 配置、pip 镜像配置、安装验证，以及可选 Python 工具链、系统工具和常用库安装。用户提到安装 Python、配置 pip、修复 Python 命令不可用、PATH 异常、Windows Python 环境准备时应使用本 Skill。
version: "1.0.0"
---

# Install Python

用于在 Windows 上安装或修复 Python 环境。非 Windows 系统先说明本 Skill 主要面向 Windows，再按当前系统给出等价方案，不要直接执行 Windows 专用命令。

## 开始前

先确认用户目标和本机状态：

```powershell
python --version 2>$null
py --version 2>$null
pip --version 2>$null
[System.Environment]::Is64BitOperatingSystem
```

- 如果用户指定了版本号，例如 `3.12.3`，直接使用该版本。
- 如果用户只说“latest”或“最新版”，优先选择 Python 官网 Windows stable releases 中最新稳定版。
- 如果未指定版本，给出 3-5 个稳定版选项，让用户选择后再继续。
- 如果已有 Python，说明当前版本和路径，确认是升级、并存安装还是修复 PATH/pip。

## 下载安装包

默认从清华镜像下载 Windows 64 位安装包：

```text
https://mirrors.tuna.tsinghua.edu.cn/python/{version}/python-{version}-amd64.exe
```

PowerShell 示例：

```powershell
$version = "{selected_version}"
$filename = "python-$version-amd64.exe"
$url = "https://mirrors.tuna.tsinghua.edu.cn/python/$version/$filename"
$installer = "$env:USERPROFILE\Downloads\$filename"

Write-Host "正在下载 Python $version: $url"
Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
Write-Host "下载完成: $installer"
```

如果是 32 位 Windows，把文件名改为 `python-$version.exe`。如果清华镜像中没有该补丁版本，先确认完整版本号是否存在，再改用 Python 官网或其他可信镜像。

## 安装

默认采用全用户静默安装，这需要管理员权限。执行前提醒用户：如果弹出 UAC，请点击“是”。

```powershell
$version = "{selected_version}"
$installer = "$env:USERPROFILE\Downloads\python-$version-amd64.exe"

Start-Process -FilePath $installer -ArgumentList @(
  "/quiet",
  "InstallAllUsers=1",
  "PrependPath=1",
  "Include_test=0",
  "Include_doc=0",
  "Include_dev=1",
  "Include_exe=1",
  "Include_launcher=1"
) -Wait -NoNewWindow
```

关键参数：

- `/quiet`：静默安装。
- `InstallAllUsers=1`：安装到所有用户，需要管理员权限。
- `PrependPath=1`：自动把 Python 和 Scripts 目录加入 PATH。
- `Include_launcher=1`：安装 `py.exe`，便于多版本管理。

如果用户不希望静默安装，改用交互式安装：

```powershell
Start-Process -FilePath $installer -Wait
```

交互式安装时明确提醒用户勾选 “Add Python to PATH”。

## 刷新 PATH

安装后当前终端可能还没拿到新的环境变量，先刷新会话 PATH：

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
```

如果 `python` 仍不可用，检查 PATH：

```powershell
[System.Environment]::GetEnvironmentVariable("Path", "Machine") -split ";" | Select-String -Pattern "Python"
[System.Environment]::GetEnvironmentVariable("Path", "User") -split ";" | Select-String -Pattern "Python"
```

必要时手动加入系统 PATH，路径形如：

- `C:\Program Files\Python312\`
- `C:\Program Files\Python312\Scripts\`

## 配置 pip 镜像

安装成功后设置 pip 默认清华源：

```powershell
python -m pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple/
python -m pip config set global.trusted-host pypi.tuna.tsinghua.edu.cn
python -m pip config list
```

如果用户希望切换镜像，可替换为：

- 阿里云：`https://mirrors.aliyun.com/pypi/simple/`
- 中科大：`https://pypi.mirrors.ustc.edu.cn/simple/`
- 官方源：`python -m pip config unset global.index-url`

## 验证

安装后必须验证：

```powershell
python --version
pip --version
py -0p
python -c "import sys; print('Python executable:', sys.executable); print('Python version:', sys.version)"
```

验证通过后向用户汇报版本、可执行文件路径和 pip 状态。如果失败，按顺序排查安装退出码、PATH、终端重启、已有 Python 冲突、杀毒软件拦截、安装包损坏。

## 可选组件

Python 安装验证通过后，询问用户是否安装额外组件。支持用户按编号、多选或直接输入包名。

Python 工具链：

```powershell
python -m pip install uv
python -m pip install pipx
python -m pipx ensurepath
python -m pip install poetry
python -m pip install pdm
```

系统工具通过 `winget` 安装：

```powershell
winget install --id JohnMacFarlane.Pandoc -e --silent
winget install --id Gyan.FFmpeg -e --silent
winget install --id ImageMagick.ImageMagick -e --silent
winget install --id Graphviz.Graphviz -e --silent
```

常用 Python 库：

```powershell
python -m pip install numpy pandas scipy
python -m pip install matplotlib seaborn
python -m pip install requests flask fastapi uvicorn
python -m pip install sqlalchemy pymongo redis
python -m pip install pytest pytest-cov tox
python -m pip install black ruff mypy isort
```

组件安装后按实际选择验证：

```powershell
uv --version
pipx --version
poetry --version
pdm --version
pandoc --version
ffmpeg -version
magick --version
dot -V
python -c "import numpy; print('numpy', numpy.__version__)"
python -c "import pandas; print('pandas', pandas.__version__)"
```

## 清理

安装和验证完成后，询问用户是否删除下载的安装包：

```powershell
Remove-Item "$env:USERPROFILE\Downloads\python-{version}-amd64.exe"
```

不要在未确认成功安装前清理安装包。
