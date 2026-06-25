# WorkMate 构建流程说明

## 一、整体流程

```
源码 ──→ dist/ ──→ WorkMate Setup x.x.x.exe
      compile      package
```

分为两个阶段：
1. **编译阶段**（`bun run build`）：TypeScript 源码 → `dist/` 目录
2. **打包阶段**（`electron-builder`）：`dist/` → 安装包

---

## 二、编译阶段

命令：`bun run build`

等同于依次执行：
```
bun run build:main      → 主进程
bun run build:preload   → preload 桥接
bun run build:renderer  → 渲染进程
bun run build:resources → 静态资源
```

### 2.1 主进程编译

| 项目 | 说明 |
|------|------|
| 工具 | **esbuild** |
| 源码 | `src/main/index.ts`（及其所有 import） |
| 产物 | `dist/main.cjs` |
| 产物用途 | Electron 启动时通过 `package.json` 的 `"main"` 字段加载，是应用的总入口 |
| 运行环境 | Node.js（CJS 格式） |
| 关键配置 | `--external:electron`, `--external:@anthropic-ai/claude-agent-sdk`（这两个由运行时提供，不打进 bundle） |

同时产出：
| 产物 | 用途 |
|------|------|
| `dist/plugin-install-worker.cjs` | 插件安装的独立 worker 进程，避免阻塞主线程 |

### 2.2 preload 编译

| 项目 | 说明 |
|------|------|
| 工具 | **esbuild** |
| 源码 | `src/preload/index.ts` |
| 产物 | `dist/preload.cjs` |
| 产物用途 | Electron BrowserWindow 创建时指定为 preload 脚本，通过 `contextBridge` 将主进程 IPC API 安全暴露给渲染进程 |
| 运行环境 | Node.js（CJS 格式） |

### 2.3 渲染进程编译

| 项目 | 说明 |
|------|------|
| 工具 | **Vite**（基于 esbuild + Rollup） |
| 源码 | `src/renderer/` 下所有 React/TSX/CSS/图片 |
| 产物 | `dist/renderer/` |
| 产物用途 | 用户看到的整个 UI 界面，Electron 主进程中通过 `loadFile('dist/renderer/index.html')` 加载 |
| 运行环境 | Chromium（浏览器环境） |

产物包含：
| 文件 | 用途 |
|------|------|
| `index.html` | SPA 入口 HTML |
| `assets/*.js` | Vite 打包后的 React 应用 JS bundle |
| `assets/*.css` | TailwindCSS + 组件样式 |

### 2.4 静态资源复制

| 项目 | 说明 |
|------|------|
| 工具 | **bun 脚本** |
| 产物 | `dist/resources/` |
| 主要文件 | DPAPI 原生模块预编译文件（用于 Windows 凭据加密） |

---

## 三、打包阶段

命令：`bun run dist:win`（即 `electron-builder --win`）

读取 `electron-builder.yml` 配置，执行以下步骤：

### 3.1 收集文件（files 白名单）

| 源 | 打包后位置 | 说明 |
|----|-----------|------|
| `dist/**/*` | `app.asar` 内 | 编译产物（主进程 + preload + 渲染进程） |
| `package.json` | `app.asar` 内 | 应用元数据 |
| `node_modules/@anthropic-ai/claude-agent-sdk/**` | `app.asar.unpacked` | Claude Agent SDK native binary（需保持文件路径可被 spawn，不放 asar 内） |
| `node_modules/@anthropic-ai/claude-agent-sdk-{platform}-{arch}/**` | `app.asar.unpacked` | SDK 的按平台原生子包 |
| `node_modules/pdfjs-dist/**` | `app.asar` 内 | PDF 预览引擎（本地化，避免运行依赖 CDN） |

排除项：
| 源 | 原因 |
|----|------|
| `node_modules/@proma/**` | workspace 包，代码已由 esbuild/Vite bundle 进 `dist/`，不需要单独携带 |

### 3.2 收集额外资源（extraResources）

这些文件放在安装包的 `resources/` 目录下（**不在** `app.asar` 内），运行时通过 `process.resourcesPath` 读取：

| 源 | 打包后位置 | 用途 | 启动时使用方式 |
|----|-----------|------|---------------|
| `default-connectors/` | `resources/default-connectors/` | 预置连接器模板（飞书 CLI、hi-agent、华泰邮箱） | `seedDefaultConnectors()` → 复制到 `~/.workmate/default-connectors/` |
| `default-skills/` | `resources/default-skills/` | 预置 Skill 模板 | `seedDefaultSkills()` → 复制到 `~/.workmate/default-skills/` |
| `bundled-plugins/` | `resources/default-plugins/` | 预置插件（专家团等） | `seedDefaultPlugins()` → 复制到 `~/.workmate/default-plugins/` |
| `resources/dpapi-prebuilds/` | `resources/dpapi-prebuilds/` | DPAPI 原生加密模块 | 飞书 CLI OAuth 凭据加密 |
| `tutorial/tutorial.md` | `resources/tutorial.md` | 教程文件 | 教程查看器和欢迎对话 |
| `resources/proma-logos/` | `resources/proma-logos/` | 品牌 Logo 素材 | 素材下载功能 |
| `resources/icon.png` | `resources/icon.png` | 应用图标 | macOS Dock 图标 |

### 3.3 ASAR 归档

将所有代码文件打包成 `app.asar`（类似 JAR 文件），压缩存储，加快加载速度。

例外（`asarUnpack`）：
- `dist/plugin-install-worker.cjs` — 需要作为独立进程 fork
- `node_modules/@anthropic-ai/**` — SDK native binary 需要文件系统路径才能被 spawn

### 3.4 生成安装包

按平台配置生成最终产物：

| 产物 | 用途 |
|------|------|
| `WorkMate Setup 0.12.51.exe` | **用户安装包**：包含应用代码 + Electron 运行时（Chromium + Node.js），用户双击安装 |
| `WorkMate-0.12.51-win-x64.exe.blockmap` | **增量更新索引**：exe 的 64KB 块级 hash 表（项目目前使用全量下载更新，此文件未实际使用） |
| `latest.yml` | **自动更新清单**：包含版本号、文件名、sha512、文件大小（项目目前使用自建 API，此文件未实际使用） |

---

## 四、产物生命周期

```
编译产物 (dist/)
  │
  ├── 开发模式：electronmon 加载 dist/main.cjs，Vite 热更新 dist/renderer/
  │
  └── 生产打包：electron-builder 将 dist/ + node_modules/ + 资源 打成安装包

安装后目录结构 (Windows)：
  C:\Program Files\WorkMate\
  ├── WorkMate.exe                    ← Electron 入口（Chromium + Node.js）
  ├── resources/
  │   ├── app.asar                   ← 应用代码（编译产物 + node_modules）
  │   ├── default-connectors/        ← 连接器模板
  │   ├── default-skills/            ← 技能模板
  │   ├── default-plugins/           ← 插件模板
  │   ├── dpapi-prebuilds/           ← DPAPI 加密模块
  │   ├── tutorial.md                ← 教程
  │   ├── proma-logos/               ← Logo 素材
  │   └── icon.png                   ← 应用图标
  └── locales/                       ← Electron 语言包

用户数据目录 (Windows)：
  C:\Users\{用户名}\AppData\Roaming\HtAiWorkBench\
  ├── settings.json                  ← 应用设置
  ├── channels.json                  ← AI 渠道配置
  ├── conversations.json             ← 对话索引
  ├── conversations/                 ← 对话消息
  ├── agent-sessions.json            ← Agent 会话索引
  ├── agent-sessions/                ← Agent 会话消息
  ├── agent-workspaces/              ← 工作区数据
  │   └── {slug}/
  │       ├── connectors/            ← 连接器配置（从 default-connectors 同步）
  │       ├── mcp.json               ← MCP 服务器配置
  │       └── skills/                ← 用户自定义技能
  ├── default-connectors/            ← 预置连接器（启动时从安装包解压）
  ├── default-skills/                ← 预置技能
  ├── default-plugins/               ← 预置插件
  ├── attachments/                   ← 附件文件
  └── logs/                          ← 应用日志
```

---

## 五、工具角色总结

| 工具 | 角色 | Maven 类比 |
|------|------|-----------|
| **Bun** | 包管理 + 脚本编排 | Maven Wrapper + 生命周期调度 |
| **esbuild** | Node.js 端代码打包 | `maven-compiler-plugin`（主进程/preload 部分） |
| **Vite** | 浏览器端代码打包 + 开发热更新 | `maven-compiler-plugin`（渲染进程部分） |
| **electron-builder** | 安装包制作 | `maven-assembly-plugin` |
| **Electron** | 运行时容器（Chromium + Node.js） | JVM |

### 关键配置文件

| 文件 | 作用 | Maven 类比 |
|------|------|-----------|
| `package.json` | 声明 workspaces 子模块、共享依赖、SDK 版本 overrides | 父 `pom.xml`（`<modules>` + `<dependencyManagement>`） |
| `bun.lock` | 依赖版本锁定文件 | `pom.xml` 中的 `<dependencyManagement>` 锁定版本号的效果 |
| `bunfig.toml` | Bun 全局安装配置，如 `ignore-scripts = false`（允许 native module 编译） | `.mvn/maven.config` |

> `bun.lock` 类似于 `package-lock.json` / `yarn.lock`，记录了每个依赖的**确切版本和校验和**，确保团队和 CI 安装依赖完全一致。每次 `bun install` 自动更新，必须提交到 Git。
>
> 如果没有 `bun.lock`（或等效），不同机器可能安装到同一个包的**不同 patch 版本**，导致"我这能跑，你那崩了"的问题——相当于 Maven 里不写 `<version>` 的 SNAPSHOT 依赖问题。

---

## 六、Bun workspace 依赖提升（hoist）

### 什么是 hoist

hoist（提升）是 monorepo 包管理器的一种优化策略。当多个子项目依赖同一个包时，包管理器会把这份依赖从子项目的 `node_modules/` 提升到根目录的 `node_modules/`，全局共享一份，避免重复安装和磁盘浪费。

```
提升前（各自安装）                   提升后（hoist 到根）

apps/electron/node_modules/react ←─┐
                                    ├──→  node_modules/react   ← 只保留一份
packages/shared/node_modules/react ←┘

apps/electron/node_modules         →  （空）
packages/shared/node_modules       →  （空）
```

### Bun 的 .bun/ 目录结构

Bun 比 npm 更激进，把所有依赖扁平化到一个 `.bun/` 目录（类似 pnpm 的 `.pnpm/`）：

```
.bun/
  react@18.3.1/
    node_modules/react/             ← react 本体
  node-gyp-build@4.8.0/
    node_modules/node-gyp-build/    ← 嵌套依赖也被提出去了
  @primno+dpapi@2.0.1/
    node_modules/@primno/dpapi/     ← @primno/dpapi 本体
```

### hoist 导致的问题：require 解析路径断裂

Node.js 的 `require()` 按**目录树向上查找** `node_modules/`：

```
某个包内部调用 require('node-gyp-build')
  → 从该包所在目录开始
  → 找 ./node_modules/ → 没有
  → 找 ../node_modules/ → 没有
  → ...一直到根目录 → 还是没找到
  → 报错：MODULE_NOT_FOUND
```

但 `node-gyp-build` 是存在的，只是被 Bun hoist 到了 `.bun/node-gyp-build@4.8.0/node_modules/` 里，**不在 Node.js 的向上查找路径上**。

### 本项目的解决方案

[dpapi.ts](../../apps/electron/src/main/lib/dpapi.ts) 中的 `@primno/dpapi` 就遇到了这个问题。它内部依赖 `node-gyp-build` 来查找预编译的 `.node` 文件，但 hoist 后找不到。

解决方式是**绕过依赖解析，手动定位二进制文件**：

```ts
// ❌ 正常方式（hoist 后失败）
const dpapi = require('@primno/dpapi')
// → 内部 require('node-gyp-build') → 找不到 → 报错

// ✅ 本项目的做法
const prebuildPath = findFile([
  'resources/dpapi-prebuilds/win32-x64/@primno+dpapi.node',  // 打包后路径
  'node_modules/@primno/dpapi/prebuilds/win32-x64/...',       // 标准路径
])
const dpapi = require(prebuildPath)  // 直接加载 .node，跳过 node-gyp-build
```

### Maven 类比

Maven 不存在这个问题，因为 Java 编译时已经把所有依赖平铺到 classpath 里，运行时通过 ClassLoader 加载，不依赖目录结构查找。可以理解为：

```
Bun hoist  →  Maven <dependencyManagement> + flatten-maven-plugin
Node require  →  ClassLoader.loadClass()
问题本质    →  依赖被移到 .bun/ 后，目录查找路径断裂（类似 jar 改名后 -classpath 路径失效）
```
