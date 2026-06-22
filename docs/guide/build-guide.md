# Proma 项目构建指南

本文档介绍 Proma 项目的开发环境配置、编译构建流程和发布打包。

---

## 🚀 傻瓜式打包（3步完成）

只需要最简单的 3 步，就可以打出当前平台的安装包：

### 第 1 步：安装依赖

```bash
# 在项目根目录执行
bun install
```

### 第 2 步：构建

```bash
# 必须在项目根目录执行！不要进入子目录！
bun run build
```

### 第 3 步：打包

```bash
# 必须在项目根目录执行！不要进入子目录！
bun run electron:build && cd apps/electron && bun run dist
```

或者先 cd 到 apps/electron 再打包也行：

```bash
# 方式 2：分步执行
cd apps/electron
bun run dist
```

✅ **完成！** 打包好的文件在 `apps/electron/out/` 目录下。

---

## 快速启动（开发模式）

如果只是想运行起来看看，不需要打包：

```bash
# 在项目根目录执行
bun install
bun run dev
```

---

## 详细文档（进阶）

如果你想了解更多细节，请继续阅读下面的内容：

---

## 项目结构

```
Proma/
├── package.json          # 根项目配置 (Bun Workspace)
├── tsconfig.json         # 根 TypeScript 配置
├── apps/
│   └── electron/         # Electron 主应用
└── packages/
    ├── shared/           # 共享类型和工具
    ├── core/             # 核心模块
    └── ui/               # UI 组件库
```

---

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Bun | latest | 包管理器、运行时 |
| TypeScript | ^5.0 | 类型系统 |
| Vite | ^6.0 | Renderer 构建工具 |
| esbuild | ^0.24.0 | Main/Preload 打包工具 |
| Electron | 39.5.1 | 桌面应用框架 |
| React | ^18.3 | UI 框架 |

---

## 环境要求

### 必需依赖

1. **Bun** - 项目强制使用 Bun

```bash
# 安装 Bun (Windows)
powershell -c "irm bun.sh/install.ps1 | iex"

# 验证安装
bun --version
```

2. **Node.js** (Electron 构建需要)

```bash
# 建议使用 v20.x 或更高版本
node --version
```

3. **Python 3.10+** (部分 Skills 脚本需要)

```bash
python --version
```

### 可选依赖

- **Git** - 版本控制
- **Xcode Command Line Tools** (macOS) - Electron 原生模块编译
- **Visual Studio Build Tools** (Windows) - Electron 原生模块编译

---

## 安装依赖

```bash
# 克隆项目
git clone https://github.com/ErlichLiu/Proma.git
cd Proma

# 安装所有依赖 (Bun Workspace)
bun install
```

这会安装根项目和所有 workspace 包的依赖。

---

## 开发模式

### 启动完整开发环境

```bash
# 方式 1：从根项目启动
bun run dev

# 方式 2：直接在 apps/electron 目录下启动
cd apps/electron
bun run dev
```

开发模式会同时启动：

1. **Vite Dev Server** - 为 Renderer 进程提供热更新
2. **esbuild Watch** - 监视并自动编译 Main/Preload 进程
3. **Electron** - 桌面应用窗口

### 分离式开发（高级）

如果你想分别启动各个开发进程：

```bash
cd apps/electron

# 终端 1: 启动 Vite
bun run dev:vite

# 终端 2: 启动 Electron 开发环境
bun run dev:electron
```

---

## 构建流程

项目使用 **多工具组合** 的构建策略：

### 1. Renderer 进程 - Vite

```bash
# 构建 Renderer
cd apps/electron
bun build:renderer
```

输出目录：`apps/electron/dist/renderer/`

Vite 负责：
- React 组件编译
- CSS 处理 (Tailwind CSS + PostCSS)
- 静态资源打包
- 代码分割和压缩

### 2. Main 进程 - esbuild

```bash
# 构建 Main 进程
cd apps/electron
bun build:main
```

输出目录：`apps/electron/dist/main.cjs`

esbuild 配置：
- `--bundle` - 打包所有依赖
- `--platform=node` - Node.js 环境
- `--format=cjs` - CommonJS 格式
- `--external:electron` - 排除 Electron
- `--external:@anthropic-ai/claude-agent-sdk` - 排除 SDK

### 3. Preload 进程 - esbuild

```bash
# 构建 Preload
cd apps/electron
bun build:preload
```

输出目录：`apps/electron/dist/preload.cjs`

### 4. 资源文件

```bash
# 复制资源到 dist 目录
cd apps/electron
bun build:resources
```

复制内容：
- `apps/electron/resources/` -> `dist/resources/`

### 完整构建

```bash
# 从根目录构建所有包
bun build

# 或者只构建 Electron App
cd apps/electron
bun build
```

这会依次执行：
1. `build:main`
2. `build:preload`
3. `build:renderer`
4. `build:resources`

---

## 测试

```bash
# 运行所有测试
bun test

# 类型检查
bun typecheck
```

---

## 发布打包

### 打包应用程序

```bash
cd apps/electron

# 仅打包不发布（生成 unpacked 目录）
bun pack

# 打包为当前平台的可分发格式
bun dist

# 分平台打包
bun dist:mac    # macOS
bun dist:win    # Windows
bun dist:linux  # Linux
```

### 发布相关脚本

```bash
# 可视化发布流程
bun dist:visual

# 快速发布（当前架构 + DMG）
bun dist:fast

# 调试发布（显示详细日志）
bun dist:debug
```

打包配置位于：`apps/electron/electron-builder.yml`

### 打包产物

- **macOS**: `.dmg`、`.zip`
- **Windows**: `.exe` (NSIS 安装程序)
- **Linux**: `.AppImage`、`.deb`、`.rpm`

---

## 常用命令速查

| 命令 | 说明 |
|------|------|
| `bun install` | 安装依赖 |
| `bun dev` | 开发模式 |
| `bun build` | 构建所有包 |
| `bun typecheck` | TypeScript 类型检查 |
| `bun test` | 运行测试 |
| `cd apps/electron && bun build` | 构建 Electron App |
| `cd apps/electron && bun pack` | 打包 unpacked 目录 |
| `cd apps/electron && bun dist` | 完整发布打包 |

---

## 常见问题

### 0. `esbuild: command not found` / 找不到依赖

这是因为你在子目录（如 `apps/electron`）下运行 `bun run build`！

**解决方法：必须在根目录运行构建！**

```bash
# ❌ 错误做法
cd apps/electron
bun run build  # 会报错找不到 esbuild/vite 等

# ✅ 正确做法
cd ..  # 回到项目根目录
bun run build
```

根目录的 package.json 会通过 `--filter` 自动处理 workspace 依赖解析。

---

### 1. Bun 命令找不到

确保 Bun 已正确安装并添加到 PATH：

```bash
# 查看 Bun 安装路径
bun pm bin

# Windows 可能需要重启终端或刷新 PATH
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","User") + ";" + [System.Environment]::GetEnvironmentVariable("Path","Machine")
```

### 2. 依赖安装失败

尝试：

```bash
# 清除缓存并重新安装
rm -rf node_modules bun.lockb
bun install
```

### 3. Electron 开发模式启动慢

首次启动 Electron 可能较慢，因为需要解包框架。后续启动会快很多。

### 4. 类型检查失败但代码看起来没问题

可能是缓存问题，尝试：

```bash
# 清理 TypeScript 缓存
rm -rf node_modules/.cache

# 重新安装依赖
bun install

# 再次检查
bun typecheck
```

### 5. `bun install` 报 `ENOENT: failed linking dependency/workspace`（Windows）

**原因**：Windows 默认不允许非管理员创建符号链接，导致 Bun 无法链接 workspace 内部包（`@proma/shared`、`@proma/electron` 等）。

**解决**：开启 Windows 开发者模式。

```powershell
# 以管理员身份运行 PowerShell，执行：
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense /t REG_DWORD /d 1 /f
```

重启电脑后重新 `bun install`。

> 验证：执行 `(Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" -Name AllowDevelopmentWithoutDevLicense).AllowDevelopmentWithoutDevLicense`，返回 `1` 表示已开启。

### 6. `bun run build` 报 `rollup failed to resolve import "prosemirror-xxx"`（Windows）

**原因**：`bun.lock` 由其他平台生成时，部分嵌套依赖在 Windows 上未被正确解析，导致 `prosemirror-state`、`prosemirror-model` 等 tiptap 的底层包缺失。

**解决**：

```bash
cd d:\code\workmate\dev\AiWorkbench
bun install
```

如果还是不行，手动安装缺失的包：

```bash
bun add -d prosemirror-state
```

> `-d` 表示安装到根 `devDependencies`，不会污染 `apps/electron/package.json`。

### 7. `bun run dev` 报 `Electron failed to install correctly`

**根本原因链**：

```
bun install 执行流程
  └─ 尝试把 workspace 内部包（@proma/shared、@proma/electron）
     链接到 apps/electron/node_modules/
  └─ Bun 1.3.x 在 Windows 上创建符号链接不稳定
  └─ 链接失败 → ENOENT: failed linking dependency/workspace
  └─ Bun 判定安装异常，后续所有包的 postinstall 脚本被跳过
  └─ electron 包的 install.js 根本没机会执行
  └─ electron.exe 永远不会被下载
```

> **与网络/镜像无关**。postinstall 连跑都没跑，所以即使配置了 npmmirror 镜像也无效。

**解决（手动绕过）**：

1. 手动解压已缓存的 Electron ZIP：

```powershell
Expand-Archive -Path "$env:LOCALAPPDATA\electron\Cache\electron-v39.5.1-win32-x64.zip" `
  -DestinationPath "d:\code\workmate\dev\AiWorkbench\node_modules\.bun\electron@39.5.1+3844822a191571ee\node_modules\electron\dist" `
  -Force
```

> 版本号 `39.5.1+3844822a191571ee` 可能随 electron 版本变化。用 `Get-ChildItem node_modules\.bun -Directory -Filter "electron@*"` 查找实际目录名。

2. 创建 `path.txt` 告诉 Electron 可执行文件名（**必须用 ASCII 编码**）：

```powershell
Set-Content -Path "node_modules\.bun\electron@39.5.1+3844822a191571ee\node_modules\electron\path.txt" `
  -Value "electron.exe" -Encoding ASCII -NoNewline
```

> PowerShell 的 `echo` 默认输出 UTF-16，Node.js 读出来会是乱码，导致 `ERR_INVALID_ARG_VALUE: null bytes` 错误。必须用 `Set-Content -Encoding ASCII`。

### 8. `bun install` 出现 `Slow filesystem detected` 或 workspace 链接失败（Windows）

**原因**：`bun.lock` 在 macOS/Linux 上生成时，记录了与 Unix 符号链接适配的依赖解析方式。Windows 上的 Bun 解析同一份 lockfile 可能路径对不上，导致 workspace 包映射失败。

> `bun.lock` 是依赖的精确快照。它锁定所有包的确切版本和嵌套依赖关系，确保团队所有人的 `bun install` 安装完全相同的依赖。跨平台时，platform-specific 的依赖（如 `@anthropic-ai/claude-agent-sdk-win32-x64` vs `darwin-arm64`）如果在 lockfile 中标记为另一个平台，Windows 端 Bun 可能跳过，造成链式缺失。

**解决**：

```bash
cd d:\code\workmate\dev\AiWorkbench
rm -Force bun.lock
bun install
```

> 这样会基于当前 Windows 平台重新生成 `bun.lock`。如果希望团队兼容，把新生成的 lockfile 提交到仓库。

---

## 进一步阅读

- [Electron 文档](https://www.electronjs.org/docs/latest/)
- [Vite 文档](https://cn.vitejs.dev/)
- [Bun 文档](https://bun.sh/docs)
- [TypeScript 文档](https://www.typescriptlang.org/docs/)
