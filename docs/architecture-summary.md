
# Proma 架构总结与技术分析文档

> 分析日期：2026-06-03
> 分析范围：`apps/electron`、`packages/shared`、`packages/core`、`packages/ui`

---

## 一、项目概述

**Proma** 是一个本地优先的开源 AI 桌面应用，将**多模型 Chat**、**通用 Agent**、**工作区**、**Skills**、**MCP**、**远程机器人桥接**和**记忆能力**集成在同一个 Electron 客户端中。

| 属性 | 说明 |
| --- | --- |
| 名称 | Proma（原名 WorkMate） |
| 许可证 | AGPL-3.0 |
| 仓库 | https://github.com/ErlichLiu/Proma |
| 运行时 | Bun（monorepo workspace） |
| 桌面框架 | Electron 39 |
| 前端 | React 18 + TypeScript |
| Agent SDK | `@anthropic-ai/claude-agent-sdk@0.3.143` |

---

## 二、Monorepo 工程结构

```
proma/
├── package.json                    # 根 monorepo（Bun workspace）
├── packages/
│   ├── shared/                     # @proma/shared — 共享类型、IPC 常量、配置
│   ├── core/                       # @proma/core — Provider 适配器、SSE、代码高亮
│   └── ui/                         # @proma/ui — 共享 React UI 组件
├── apps/
│   └── electron/                   # @proma/electron — Electron 桌面应用
│       ├── bundled-plugins/        # 内置插件（dpmp-assist、superpowers）
│       └── default-skills/         # 默认技能集（14 个 Skill）
│           ├── brainstorming/      ├── drawio/          ├── guizang-ppt-skill/
│           ├── docx/               ├── pptx/            ├── xlsx/
│           ├── pdf/                ├── skill-creator/   ├── tool-builder/
│           ├── executing-plans/    ├── writing-plans/   ├── find-skills/
│           ├── proma-coach/        ├── web-search/      └── install-python/
└── docs/                           # 项目文档
```

### 包依赖关系

```text
@proma/shared（无运行时依赖）
    ↓
@proma/core（依赖 shared + shiki）
    ↓
@proma/ui（依赖 core + shared + mermaid）
    ↓
@proma/electron（依赖所有包 + claude-agent-sdk）
```

---

## 三、技术栈

| 层级 | 技术选型 | 说明 |
| --- | --- | --- |
| 运行时 | Bun | monorepo 管理 + 脚本执行 |
| 桌面框架 | Electron 39 | 主进程 + preload + 渲染进程 |
| 前端框架 | React 18 + TypeScript | 组件化 UI |
| 状态管理 | Jotai | 原子化状态管理 |
| 样式方案 | Tailwind CSS + Radix UI | 实用优先 CSS + 无头 UI |
| 富文本 | TipTap | 输入框富文本编辑 |
| 渲染 | React Markdown + KaTeX + Beautiful Mermaid + Shiki | Markdown / 公式 / 图表 / 代码高亮 |
| 构建 | Vite + esbuild | 渲染进程 Vite，主进程/preload esbuild |
| 分发 | electron-builder | macOS / Windows 安装包 |
| SDK | `@anthropic-ai/claude-agent-sdk@0.3.143` | Agent 核心能力 |
| AI SDK | `@anthropic-ai/sdk` + OpenAI SDK | Chat 供应商接入 |
| 协议 | `@modelcontextprotocol/sdk` | MCP 工具集成 |

---

## 四、进程架构

```text
┌──────────────────────────────────────────────────────────┐
│                     Electron App                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              主进程 (Main Process)                   │ │
│  │                                                      │ │
│  │  apps/electron/src/main/                             │ │
│  │  ├── index.ts          应用生命周期 + 窗口管理         │ │
│  │  ├── ipc.ts            IPC 通道注册（2000+ 行）        │ │
│  │  ├── menu.ts           原生菜单                        │ │
│  │  ├── tray.ts           系统托盘                        │ │
│  │  └── lib/              服务层（40+ 模块）              │ │
│  │      ├── agent-orchestrator.ts     Agent 编排         │ │
│  │      ├── agent-service.ts          Agent IPC 薄层     │ │
│  │      ├── agent-event-bus.ts        事件总线           │ │
│  │      ├── agent-session-manager.ts  会话&JSONL 持久化  │ │
│  │      ├── agent-workspace-manager.ts 工作区管理        │ │
│  │      ├── agent-permission-service.ts 权限控制        │ │
│  │      ├── agent-ask-user-service.ts  用户追问         │ │
│  │      ├── agent-prompt-builder.ts    系统提示词构建    │ │
│  │      ├── chat-service.ts            Chat 流式服务     │ │
│  │      ├── conversation-manager.ts    聊天会话管理      │ │
│  │      ├── channel-manager.ts         渠道 CRUD        │ │
│  │      ├── memory-service.ts          记忆服务          │ │
│  │      ├── chat-tool-executor.ts      工具调用执行器    │ │
│  │      ├── feishu/                   飞书桥接           │ │
│  │      ├── dingtalk-bridge.ts        钉钉桥接           │ │
│  │      ├── wechat-bridge.ts          微信桥接           │ │
│  │      ├── document-parser.ts         文档解析          │ │
│  │      └── ...                                         │ │
│  └────────────────────────────────────────────────────┘ │
│                          │  IPC (contextBridge)           │
│  ┌────────────────────────────────────────────────────┐ │
│  │              Preload (preload/index.ts)              │ │
│  │              window.electronAPI 安全暴露             │ │
│  └────────────────────────────────────────────────────┘ │
│                          │                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │          渲染进程 (Renderer - React)                 │ │
│  │                                                      │ │
│  │  apps/electron/src/renderer/                         │ │
│  │  ├── App.tsx                    根组件               │ │
│  │  ├── atoms/                     Jotai 状态原子       │ │
│  │  │   ├── chat-atoms.ts          Chat 状态           │ │
│  │  │   ├── agent-atoms.ts         Agent 状态          │ │
│  │  │   ├── tab-atoms.ts           标签页管理          │ │
│  │  │   ├── feishu-atoms.ts        飞书状态            │ │
│  │  │   ├── theme.ts              主题状态            │ │
│  │  │   └── ...                                       │ │
│  │  └── components/                 UI 组件             │ │
│  │      ├── agent/                 Agent 视图          │ │
│  │      ├── chat/                  Chat 视图           │ │
│  │      ├── app-shell/             应用外壳            │ │
│  │      ├── settings/              设置面板            │ │
│  │      ├── tabs/                  多标签页            │ │
│  │      ├── diff/                  文件差异预览        │ │
│  │      ├── file-browser/          文件浏览器          │ │
│  │      ├── onboarding/            新手引导            │ │
│  │      └── ui/                    基础 UI 组件库      │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 五、核心通信路径

```text
shared 类型定义 + IPC 常量
        ↓
main/ipc.ts           →  注册 ipcMain.handle / on
        ↓
preload/index.ts      →  contextBridge.exposeInMainWorld('electronAPI', ...)
        ↓
renderer Jotai atoms  →  调用 window.electronAPI.xxx
        ↓
renderer React 组件   →  消费 Jotai 原子状态
```

### IPC 通道体系

| 通道组 | 文件 | 用途 |
| --- | --- | --- |
| `IPC_CHANNELS` | `@proma/shared` | 通用 IPC（文件对话框、Shell 等） |
| `CHANNEL_IPC_CHANNELS` | 同上 | 渠道管理 |
| `CHAT_IPC_CHANNELS` | 同上 | Chat 消息流 |
| `AGENT_IPC_CHANNELS` | 同上 | Agent 会话流 |
| `FEISHU_IPC_CHANNELS` | 同上 | 飞书桥接 |
| `DINGTALK_IPC_CHANNELS` | 同上 | 钉钉桥接 |
| `WECHAT_IPC_CHANNELS` | 同上 | 微信桥接 |
| `SETTINGS_IPC_CHANNELS` | `apps/electron/types` | 设置管理 |
| `MEMORY_IPC_CHANNELS` | `@proma/shared` | 记忆服务 |
| `CHAT_TOOL_IPC_CHANNELS` | 同上 | Chat 工具调用 |

---

## 六、Agent 子系统架构

### 6.1 核心组件

```text
┌───────────────────────────────────────────────┐
│                  agent-service.ts              │
│              (IPC 薄层 + 实例化)               │
├───────────────────────────────────────────────┤
│  创建 Adapter + EventBus + Orchestrator       │
│  registerWebContents(sessionId, wc)           │
│  saveFilesToAgentSession()                    │
└────────┬─────────────┬────────────────────────┘
         │             │
         ▼             ▼
┌─────────────────┐  ┌──────────────────────────┐
│ AgentEventBus   │  │   AgentOrchestrator       │
│ 事件订阅/分发    │  │  ┌──────────────────────┐│
│ IPC 转发中间件   │  │  │ 渠道查找 + API Key   ││
│                 │  │  │ 环境变量构建          ││
│                 │  │  │ SDK 路径解析          ││
│                 │  │  │ 用户/助手消息持久化    ││
│                 │  │  │ 事件流遍历 + 文本累积  ││
│                 │  │  │ 错误处理 + 自动标题    ││
│                 │  │  │ 权限模式检查           ││
│                 │  │  │ 工具输入验证           ││
│                 │  │  │ Token 估算              ││
│                 │  │  └──────────────────────┘│
│                 │  └──────────────────────────┘
└─────────────────┘
```

### 6.2 Claude Agent SDK 适配器

[`apps/electron/src/main/lib/adapters/claude-agent-adapter.ts`](file:///d:/code/AiWorkbench/apps/electron/src/main/lib/adapters/claude-agent-adapter.ts) 封装了 `@anthropic-ai/claude-agent-sdk`，实现 `AgentProviderAdapter` 接口：

- **查询执行**：调用 `sdk.query()` 启动 Agent 对话
- **权限处理**：拦截 SDK 的 `canUseTool` / `onAskUserQuestion` 回调
- **退出计划模式**：处理 Agent 的 `exitPlanMode` 请求
- **错误映射**：将 SDK 错误转为类型化错误（网络、认证、超时等）

### 6.3 权限系统

权限模式遵循配置驱动设计：

| 模式 | 行为 |
| --- | --- |
| Default | 安全工具自动放行，敏感操作询问用户 |
| Accept Edit | 编辑类操作自动放行 |
| Bypass | 全部操作自动放行（仅限受信场景） |
| Plan | 仅读取，修改操作需确认并生成计划 |

安全工具列表在 `@proma/shared` 中定义（`SAFE_TOOLS`），包括 `read`、`grep`、`glob`、`list`、`web_search` 等只读类工具。

### 6.4 Agent 工作区

每个工作区是一个独立目录，结构如下：

```text
~/.proma/agent-workspaces/{workspace-slug}/
├── workspace-files/      # 工作区文件（Agent 的操作上下文）
├── mcp.json               # MCP Server 配置
└── skills/                # 激活的技能
    └── {skill-name}/
        └── SKILL.md       # 技能定义
```

工作区管理器支持：
- 工作区 CRUD
- MCP 配置管理（stdio / HTTP 两种传输方式）
- Skills 导入/启用/禁用
- 版本迁移（v1→v2 自动处理）

---

## 七、Chat 子系统架构

### 7.1 Provider 适配器模式

`@proma/core` 提供统一的 Provider 适配器接口，支持多供应商协议适配：

| 供应商 | 适配器 | 协议 |
| --- | --- | --- |
| Anthropic | `AnthropicAdapter` | Anthropic Messages API |
| OpenAI | `OpenAIAdapter` | Chat Completions |
| Google | `GoogleAdapter` | Gemini Generative Language API |
| DeepSeek | `AnthropicAdapter('deepseek')` | Anthropic 兼容 |
| Kimi API | `AnthropicAdapter('kimi-api')` | Anthropic 兼容 |
| Kimi Coding | `AnthropicAdapter('kimi-coding')` | Anthropic 兼容（专用 UA） |
| MiniMax | `AnthropicAdapter('minimax')` | Anthropic 兼容 |
| 豆包 | `OpenAIAdapter` | OpenAI 兼容 |
| 通义千问 | `OpenAIAdapter` | OpenAI 兼容 |
| 智谱 AI | `OpenAIAdapter` | OpenAI 兼容 |
| 自定义端点 | `OpenAIAdapter` | OpenAI 兼容 |

### 7.2 Chat 工具系统

Chat 模式支持内建工具（function calling），架构如下：

```text
chat-service.ts
    ↓ 依赖
chat-tool-registry.ts       → 工具注册（memory、web-search、agent-recommend）
chat-tool-executor.ts       → 工具调用执行器（多轮循环，最大 999 轮）
chat-tool-config.ts         → 用户工具配置管理
chat-tools-watcher.ts       → 监听工具状态变化
    ↓ 工具实现
├── memory-tool.ts           → 长期记忆工具
├── web-search-tool.ts       → 联网搜索工具
└── agent-recommend-tool.ts  → Agent 推荐工具
```

### 7.3 SSH 流式读取

[`packages/core/src/providers/sse-reader.ts`](file:///d:/code/AiWorkbench/packages/core/src/providers/sse-reader.ts) 提供通用的 SSE 解析能力，支持：

- 流式文本增量输出（`text-delta` / `content-block-delta`）
- 思考内容增量输出（`thinking-delta` / `reasoning_content`）
- 工具调用（`tool-use` / `tool-calls`）
- 流式结束检测
- 跨供应商的 SSE 格式差异适配

---

## 八、远程机器人桥接架构

Proma 支持三大平台的远程桥接，通过群聊或私聊触发本机 Agent 工作流：

```text
┌─────────────────────────────────────────────────┐
│               远程平台（手机/群聊）                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  飞书     │  │   钉钉    │  │   微信    │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │ Webhook      │ WebSocket   │ HTTP        │
└───────┼──────────────┼─────────────┼─────────────┘
        │              │             │
        ▼              ▼             ▼
┌─────────────────────────────────────────────────┐
│           Electron 主进程 Bridge 层               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────┐ │
│  │ feishu/       │ │ dingtalk/    │ │ wechat/  │ │
│  │ bridge.ts     │ │ bridge.ts    │ │ bridge.ts│ │
│  │ coordinator.ts│ │ config.ts    │ │ config.ts│ │
│  │ mirror.ts     │ │              │ │          │ │
│  │ card-render.ts│ │              │ │          │ │
│  └──────────────┘ └──────────────┘ └──────────┘ │
│              ↓                                   │
│         AgentOrchestrator (统一 Agent 入口)       │
└─────────────────────────────────────────────────┘
```

### 8.1 飞书桥接

- **并发控制**：[`RunCoordinator`](file:///d:/code/AiWorkbench/apps/electron/src/main/lib/feishu/run-coordinator.ts) 支持两层并发控制
  - **per-scope 串行**：同一 chatId/threadId 同时只允许一个 Agent run
  - **全局上限**：跨 scope 最大并发数限制，排队等待
  - **block-accumulate 模式**：run 期间新消息累积，完成后合并 flush
- **消息镜像**：[`SessionMirror`](file:///d:/code/AiWorkbench/apps/electron/src/main/lib/feishu/session-mirror.ts) 将 Agent 流式输出镜像到飞书消息卡片
- **卡片渲染**：支持流式卡片更新
- **唤醒阻断**：飞书运行时阻止系统休眠

---

## 九、数据持久化架构

Proma 不依赖本地数据库，全部使用文件存储：

```text
~/.proma/
├── channels.json              # 渠道配置（API Key 加密存储）
├── conversations.json         # Chat 会话索引
├── conversations/
│   └── {id}.jsonl             # 单会话消息日志
├── agent-sessions.json        # Agent 会话索引
├── agent-sessions/
│   └── {id}.jsonl             # 单会话 SDK 消息日志
├── agent-workspaces.json      # 工作区索引
├── agent-workspaces/          # 工作区目录
│   └── {slug}/                # 各工作区
├── attachments/               # Chat/Agent 附件
├── user-profile.json          # 用户资料
├── settings.json              # 应用设置
└── sdk-config/                # SDK 配置文件
```

### 设计要点

- **JSON 索引 + JSONL 追加日志**：会话索引用 JSON，消息流用 JSONL（追加写入，避免全量读写）
- **API Key 安全**：通过 Electron `safeStorage` 加密后存入 `channels.json`
- **原子写入**：[`safe-file.ts`](file:///d:/code/AiWorkbench/apps/electron/src/main/lib/safe-file.ts) 提供 `writeJsonFileAtomic`，通过临时文件 + 重命名保证原子性
- **版本迁移**：工作区索引支持版本号驱动的自动迁移（v1→v2）

---

## 十、Skills & MCP 技能生态系统

### 10.1 内置默认技能（14 个）

| 技能 | 说明 |
| --- | --- |
| `brainstorming` | 头脑风暴辅助 |
| `docx` | Word 文档创建与编辑 |
| `pptx` | PowerPoint 演示文稿创建 |
| `xlsx` | Excel 表格创建与编辑 |
| `pdf` | PDF 表单填充与处理 |
| `drawio` | 图表绘制（Draw.io） |
| `guizang-ppt-skill` | 归藏 PPT 风格模板 |
| `skill-creator` | 技能创建工具 |
| `tool-builder` | 工具构建器 |
| `executing-plans` | 计划执行辅助 |
| `writing-plans` | 计划编写辅助 |
| `find-skills` | 技能发现与搜索 |
| `proma-coach` | Proma 使用指导 |
| `web-search` | 联网搜索 |
| `install-python` | Python 环境安装 |

### 10.2 Skill 结构

每个 Skill 的核心是 `SKILL.md` + 可选的 `scripts/` 目录：

```text
skills/{skill-name}/
├── SKILL.md        # 技能定义（Markdown 格式）
├── scripts/        # 辅助脚本（Python/JS）
├── references/     # 参考文档
└── assets/         # 静态资源
```

### 10.3 MCP 集成

工作区级别的 MCP Server 配置支持两种传输方式：

- **stdio**：本地进程通信（适合本地工具）
- **HTTP**：远程 HTTP/SSE 连接（适合远程服务）

配置文件 `mcp.json` 位于工作区目录，Agent 启动时自动加载。

---

## 十一、UI 组件架构

### 11.1 AppShell 布局

```text
┌────────────────────────────────────────────────────┐
│  LeftSidebar          │   MainArea (Tabs)           │
│  ┌─────────────────┐  │  ┌───────────────────────┐ │  ┌──────────────┐
│  │ ModeSwitcher    │  │  │ TabBar                 │ │  │ RightSidePanel│
│  │ (Chat/Agent)    │  │  ├───────────────────────┤ │  │              │
│  │                 │  │  │                        │ │  │ - FileBrowser│
│  │ NavigatorPanel  │  │  │ TabContent             │ │  │ - DiffPreview│
│  │ ─────────────── │  │  │ (ChatView / AgentView) │ │  │ - ScratchPad │
│  │ Chat Sessions   │  │  │                        │ │  │              │
│  │ Agent Sessions  │  │  │                        │ │  │              │
│  │                 │  │  │                        │ │  │              │
│  └─────────────────┘  │  └───────────────────────┘ │  └──────────────┘
└────────────────────────────────────────────────────┘
```

### 11.2 Agent 视图组件树

```text
AgentView
├── AgentHeader（标题编辑、工作区选择、上下文用量）
├── PermissionBanner（权限模式提示 + 切换器）
├── AgentMessages（消息列表）
│   ├── ContentBlock（文本/工具调用/思考内容）
│   │   └── SDKMessageRenderer
│   │       └── tool-result-renderers/
│   │           ├── bash-result.tsx
│   │           ├── edit-result.tsx (pierre diffs)
│   │           ├── grep-result.tsx
│   │           ├── glob-result.tsx
│   │           ├── read-result.tsx
│   │           ├── write-result.tsx
│   │           ├── web-search-result.tsx
│   │           └── web-fetch-result.tsx
│   ├── ProcessBlockGroup
│   ├── TaskProgressCard
│   └── TurnFileChangesSummary
├── AskUserBanner（用户追问交互）
├── ExitPlanModeBanner（退出计划模式确认）
├── PlanModeDashedBorder（计划模式视觉指示）
├── RichTextInput + AttachmentPreview + SpeechButton
└── SidePanel（文件浏览器、差异对比）
```

### 11.3 多窗口支持

- **QuickTask**：全局快捷键触发快速任务窗口
- **VoiceDictation**：流式语音输入窗口
- **DetachedPreview**：独立预览窗口（文件预览、差异对比）

---

## 十二、关键技术决策

| 决策 | 选择 | 原因 |
| --- | --- | --- |
| 本地存储 | 文件系统（JSON/JSONL） | 避免数据库依赖，便于备份迁移 |
| IPC 常量 | 枚举（`as const` object） | 编译时类型安全，IDE 智能提示 |
| Agent SDK | Claude Agent SDK 原生二进制 | 提供完整的 Agent 能力（工具、权限、子任务） |
| 构建 | esbuild + Vite 混合 | 主进程用 esbuild（快），渲染进程用 Vite（HMR） |
| 状态管理 | Jotai | 原子化、按需订阅、TypeScript 友好 |
| UI 组件 | Radix UI + Tailwind CSS | 无头组件灵活可控，实用优先样式 |
| 供应商适配 | Provider Adapter 模式 | 统一接口，隔离协议差异 |
| 权限控制 | 配置驱动 + 工具白名单 | 安全工具自动放行，敏感操作需确认 |
| 远程桥接 | block-accumulate 模式 | 避免消息丢失，友好用户体验 |

---

## 十三、安全架构

### 13.1 API Key 安全

- API Key 通过 Electron `safeStorage.encryptString()` 加密后写入 JSON
- 解密仅在 ChannelManager 内部进行，不暴露明文到渲染进程
- 启动时清理环境变量中的 `ANTHROPIC_*` 防止泄漏

### 13.2 进程隔离

- 主进程：处理文件系统、网络、Agent SDK 调用
- Preload：`contextBridge` 暴露有限 API，隔离渲染进程
- 渲染进程：仅通过 `window.electronAPI` 调用主进程

### 13.3 Agent 权限

- 权限模式（Default / Accept Edit / Bypass / Plan）
- 安全工具白名单自动放行
- 文件操作路径限制在工作区范围内
- 工具输入验证（`agent-tool-input-validator.ts`）

---

## 十四、代码统计概览

| 模块 | 文件数（约） | 主要职责 |
| --- | --- | --- |
| `packages/shared` | ~25 | 类型定义、IPC 常量、工具函数 |
| `packages/core` | ~12 | Provider 适配器、SSE 解析、代码高亮 |
| `packages/ui` | ~6 | 共享 React 组件 |
| `apps/electron/src/main` | ~100+ | 主进程服务层 |
| `apps/electron/src/renderer` | ~150+ | React UI 组件 |
| `default-skills/` | 14 个 Skill | 内置技能集 |

---

## 十五、架构优势与改进空间

### 优势

1. **本地优先 + 零依赖数据库**：方便备份、迁移和问题排查
2. **模块化分层清晰**：shared → core → ui → electron 依赖链明确
3. **Provider 适配器模式**：轻松扩展新的 AI 供应商
4. **Agent 编排解耦**：Orchestrator 通过 Adapter + EventBus 抽象，可独立测试
5. **多平台桥接**：统一 Agent 入口，飞书/钉钉/微信复用同一套 Agent 逻辑
6. **Skills & MCP 生态**：每个工作区独立配置，技能可沉淀复用
7. **类型安全**：TypeScript 全链路类型覆盖，IPC 通道编译时检查

### 改进空间

1. **主进程 IPC 文件过大**：`ipc.ts` 超 2000 行，可考虑按领域拆分
2. **测试覆盖率**：部分核心模块缺少测试（虽然有部分 `*.test.ts`）
3. **文档解析耦合**：`document-parser.ts` 依赖 pdfjs-dist / mammoth 等重量库
4. **Agent 会话迁移**：大文件回退（rewind）逻辑复杂度高
5. **错误处理标准化**：部分模块仍以字符串传递错误，可统一用 TypedError

---

*本文档由代码分析自动生成，基于 Proma 开源版（AGPL-3.0）。*
