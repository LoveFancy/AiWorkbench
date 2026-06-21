---
name: document-dependency-setup
description: "用于文档处理专家执行任务前检查和引导安装依赖，覆盖 Pandoc、Python 包、LibreOffice、Poppler、Tesseract、Node 文档包等环境准备。Windows 下提供 Pandoc 自动下载安装和 PATH 配置脚本。"
---

# 文档处理依赖检查与安装引导

在处理 DOCX、PPTX、XLSX、PDF 之前，如果任务需要读取、转换、渲染、OCR、公式重算、表格提取或创建 Office 文件，先检查对应依赖。缺依赖时不要直接失败，要说明用途、安装方式和验证命令；能用本 Skill 脚本自动完成的，优先使用脚本。

## 快速依赖矩阵

| 能力 | 依赖 | 检查命令 | 典型用途 |
| --- | --- | --- | --- |
| DOCX 转 Markdown / 保留修订读取 | Pandoc | `pandoc --version` | `docx` 读取、`--track-changes=all` |
| DOCX 创建 | Node 包 `docx` | `node -e "require('docx')"` | 创建 Word 文档 |
| PPTX 文本提取 | `markitdown[pptx]` | `python -m markitdown --version` | 读取 PPTX |
| PPTX 创建 | Node 包 `pptxgenjs` | `node -e "require('pptxgenjs')"` | 创建幻灯片 |
| Office/PDF 转换 | LibreOffice / `soffice` | `soffice --version` | doc/docx/pptx/xlsx 转 PDF、公式重算 |
| PDF 转图片 | Poppler / `pdftoppm` | `pdftoppm -v` | 视觉 QA、页面渲染 |
| PDF OCR | Tesseract | `tesseract --version` | 扫描件识别 |
| PDF Python 处理 | `pypdf`、`pdfplumber`、`reportlab` 等 | `python -c "import pypdf, pdfplumber, reportlab"` | PDF 合并、拆分、提取、生成 |

## Pandoc 安装

### Windows 自动安装

Windows 用户优先使用本 Skill 内置脚本：

```powershell
PowerShell -ExecutionPolicy Bypass -File .\scripts\install-pandoc-windows.ps1
```

脚本会：

1. 下载 Pandoc 安装包：`https://htpan.htsc.com.cn/l/tF2Jb7`
2. 保存为 `pandoc-3.9.0.2-windows-x86_64.msi`
3. 调用 `msiexec` 安装
4. 检查常见安装目录
5. 将 Pandoc 目录写入当前用户 PATH
6. 刷新当前 PowerShell 会话的 PATH
7. 执行 `pandoc --version` 验证

如果静默安装失败，引导用户双击下载得到的 `pandoc-3.9.0.2-windows-x86_64.msi` 手动安装，然后确认 PATH 包含 Pandoc 安装目录。

### Windows 手动配置 PATH

常见 Pandoc 安装目录：

```text
C:\Users\<用户名>\AppData\Local\Pandoc
C:\Program Files\Pandoc
```

配置方式：

1. 打开“系统属性”。
2. 进入“高级” → “环境变量”。
3. 在“用户变量”中选中 `Path` → “编辑”。
4. 新增 Pandoc 安装目录，例如 `C:\Users\<用户名>\AppData\Local\Pandoc`。
5. 重新打开终端。
6. 运行 `pandoc --version` 验证。

也可以用 PowerShell 写入用户 PATH：

```powershell
$pandocDir = "$env:LOCALAPPDATA\Pandoc"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (($userPath -split ";") -notcontains $pandocDir) {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$pandocDir", "User")
}
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
pandoc --version
```

### macOS / Linux

如果用户明确要求安装 Pandoc，可按系统引导：

```bash
# macOS
brew install pandoc

# Ubuntu / Debian
sudo apt update
sudo apt install -y pandoc
```

安装后运行：

```bash
pandoc --version
```

## Python 依赖安装

Python 包优先使用清华 PyPI 源，避免默认源下载慢或失败：

```bash
python -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple --upgrade pip
python -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple pypdf pdfplumber reportlab pandas openpyxl pillow
python -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple "markitdown[pptx]"
python -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple pytesseract pdf2image
```

如果使用虚拟环境，先激活虚拟环境再安装：

```bash
python -m venv .venv
# macOS / Linux
source .venv/bin/activate
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
python -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple pypdf pdfplumber reportlab pandas openpyxl pillow
```

验证常用包：

```bash
python -c "import pypdf, pdfplumber, reportlab, pandas, openpyxl, PIL; print('document python deps ok')"
```

## Node 依赖安装

如果任务需要创建 DOCX 或 PPTX：

```bash
npm install -g docx pptxgenjs
```

如果项目使用 Bun 或本地依赖，优先按项目已有包管理方式安装，不要无故改全局环境。

验证：

```bash
node -e "require('docx'); require('pptxgenjs'); console.log('node document deps ok')"
```

## 系统工具安装引导

### LibreOffice

用于 Office 转 PDF、旧 `.doc` 转 `.docx`、Excel 公式重算。

```bash
# macOS
brew install --cask libreoffice

# Ubuntu / Debian
sudo apt update
sudo apt install -y libreoffice

# Windows
winget install TheDocumentFoundation.LibreOffice --accept-package-agreements --accept-source-agreements
```

验证：

```bash
soffice --version
```

### Poppler

用于 `pdftoppm` 把 PDF 渲染成图片。

```bash
# macOS
brew install poppler

# Ubuntu / Debian
sudo apt update
sudo apt install -y poppler-utils

# Windows
winget install oschwartz10612.Poppler --accept-package-agreements --accept-source-agreements
```

验证：

```bash
pdftoppm -v
```

### Tesseract OCR

用于扫描 PDF 或图片文字识别。

```bash
# macOS
brew install tesseract tesseract-lang

# Ubuntu / Debian
sudo apt update
sudo apt install -y tesseract-ocr tesseract-ocr-chi-sim

# Windows
winget install UB-Mannheim.TesseractOCR --accept-package-agreements --accept-source-agreements
```

验证：

```bash
tesseract --version
```

## 执行策略

1. 先根据用户任务判断最小依赖集合，不要安装无关工具。
2. 优先运行检查命令确认缺失项。
3. Pandoc on Windows 优先使用 `scripts/install-pandoc-windows.ps1`。
4. Python 包安装统一使用清华源：`-i https://pypi.tuna.tsinghua.edu.cn/simple`。
5. 系统级安装命令可能需要用户授权或管理员权限；如果权限不足，说明卡点和手动安装步骤。
6. 安装后必须运行验证命令，确认当前终端能找到工具。
