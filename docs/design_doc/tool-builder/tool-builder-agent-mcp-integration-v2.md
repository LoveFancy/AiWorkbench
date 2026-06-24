# Tool Builder → Agent MCP 集成设计 v2

> 版本：v2.0
> 日期：2026-06-16
> 状态：重新设计，待评审

---

## 一、设计目标

Tool Builder 生成的自定义 HTTP 工具（`chat-tools.json` → `customTools[]`），
在 **Agent 模式**下也能调用。Chat / Agent 共享同一配置源，一次创建双端可用。

---

## 二、上下文 Token 分析（第一优先级）

### 2.1 问题

每个自定义工具在注入到 LLM 的 `tools` 字段时，会消耗上下文 token：

| 组成部分 | 典型 Token 量（估算） |
|----------|:---:|
| 工具名 (`mcp__proma-custom-http__custom_weather`) | ~10 |
| 工具描述 (`description` 字段) | 30-80 |
| 参数 Schema (Zod → JSON Schema) | 20-50/参数 |

一个典型自定义工具的 token 开销约 **60-150 tokens**。如果用户创建了 10 个工具，就是 600-1500 tokens，可以接受。但如果创建了 50+ 个，可能超过 10K tokens，会挤占对话上下文。

### 2.2 对比：Chat 模式 vs Agent 模式

| 维度 | Chat 模式 | Agent 模式 |
|------|---------|-----------|
| 上下文敏感性 | 低，对话历史短 | **高**，Agent 上下文极其宝贵 |
| 工具选择性 | 用户手动勾选 | **全部注入** |
| 典型工具数 | 3-5 个 | 全部已启用 |
| SDK 内置工具数 | ~5 个 | ~25+ 个 (Read/Bash/Grep/Edit/...) |

**Agent 上下文比 Chat 紧张得多**，必须精细控制。

### 2.3 应对策略

**策略 1：toolStates 开关即是最佳节流阀**

```
用户不需要的工具 → 在 Chat 面板关掉 → Agent 也看不到了
```

不需要额外机制，开关本身就是 token 预算管理。

**策略 2：description 精简原则（SKILL.md 约束）**

在 Tool Builder SKILL.md 中增加约束：
- 工具描述不超过 **两句话**（40-80 字），聚焦"做什么、什么时候用"
- 参数描述不超过 **一句话**（15 字以内）
- 拒绝冗长的 API 文档式描述

**策略 3：系统提示词不追加**

Chat 模式的 `systemPromptAppend` 在 Agent 模式下 **不注入**。
Agent 已有 6000+ tokens 的系统提示词，不额外附加。

**策略 4：空工具集不注入 server**

```typescript
// 无自定义工具 → 连空的 MCP Server 都不注入，零 token 消耗
if (enabledTools.length === 0) return
```

### 2.4 Token 估算表

| 自定义工具数 | 估算 Token 消耗 | 占上下文比例 (200K) | 是否合理 |
|:---:|:---:|:---:|:--:|
| 0 | 0 | 0% | ✅ 完美 |
| 3 | ~200 | 0.1% | ✅ 无感知 |
| 10 | ~700 | 0.35% | ✅ 可接受 |
| 20 | ~1400 | 0.7% | ✅ 仍可接受 |
| 50 | ~3500 | 1.75% | ⚠️ 建议精简 |

结论：**典型场景（3-10 个工具）token 开销可忽略，无需特殊限制机制。**
超过 20 个时，通过 toolStates 开关控制即可。

---

## 三、功能实现设计

### 3.1 整体方案：一个 MCP Server 承载所有自定义工具

```
proma-custom-http (1 个 MCP Server)
    ├── custom_weather       → executeHttpTool
    ├── custom_jira          → executeHttpTool
    └── custom_eip_staff     → executeHttpTool + useEipAuth
```

选择一 Server 多 Tool 而非多 Server 的原因：
- 少一次 SDK 注入开销
- 日志/管理更清晰
- 与 automation MCP Server 模式一致

### 3.2 核心实现

```typescript
// ===== 常量 =====
export const CUSTOM_HTTP_MCP_SERVER = 'proma-custom-http'

// ===== 注入入口 =====
export async function injectHttpCustomMcpServer(
  sdk: typeof import('@anthropic-ai/claude-agent-sdk'),
  mcpServers: Record<string, Record<string, unknown>>,
): Promise<void> {
  const config = getChatToolsConfig()
  const enabledTools = config.customTools.filter(
    (t) => config.toolStates[t.id]?.enabled !== false,
  )

  // 无工具：不注入 server，零 token 消耗
  if (enabledTools.length === 0) return

  const { z } = await import('zod')
  const tools = enabledTools.map((meta) => buildMcpTool(sdk, z, meta))

  const server = sdk.createSdkMcpServer({
    name: CUSTOM_HTTP_MCP_SERVER,
    version: '1.0.0',
    tools,
  })

  mcpServers[CUSTOM_HTTP_MCP_SERVER] = server as unknown as Record<string, unknown>
  console.log(`[HTTP Custom MCP] 已注册 ${tools.length} 个工具: ${enabledTools.map((t) => t.id).join(', ')}`)
}

// ===== 单个工具构建 =====
function buildMcpTool(
  sdk: typeof import('@anthropic-ai/claude-agent-sdk'),
  z: typeof import('zod').z,
  meta: ChatToolMeta,
) {
  return sdk.tool(
    meta.id.replace(/-/g, '_'),  // custom-weather → custom_weather
    meta.description,
    buildZodSchema(z, meta.params),
    async (args) => {
      const result = await executeHttpTool({
        id: randomUUID(),
        name: meta.id,
        arguments: args,
      }, meta)

      const text = result.isError
        ? `工具执行失败: ${result.content}`
        : result.content

      return { content: [{ type: 'text' as const, text }] }
    },
    { annotations: { readOnlyHint: true } },
  )
}

// ===== Zod Schema 动态构建（与 v1 一致）=====
function buildZodSchema(z, params) {
  // string → z.string().describe(...)
  // number → z.number().describe(...)
  // boolean → z.boolean().describe(...)
  // enum → z.enum([...]).optional()
  // required=false → .optional()
}
```

### 3.3 orchestrator 注入位置

```typescript
// agent-orchestrator.ts L1274 之后
await injectAutomationMcpServer(sdk, mcpServers, { ... })

// 🆕 两行
const { injectHttpCustomMcpServer } = await import('./chat-tools/http-custom-mcp')
await injectHttpCustomMcpServer(sdk, mcpServers)
```

### 3.4 工具命名

| 层 | 名称 | 示例 |
|----|------|------|
| MCP Server | `proma-custom-http` | — |
| MCP Tool (内部) | `toolId.replace(/-/g, '_')` | `custom_weather` |
| LLM 看到的名称 | `mcp__proma-custom-http__{name}` | `mcp__proma-custom-http__custom_weather` |

> 工具名中的 `-` 替换为 `_`，因为 MCP 协议用 `__` 分隔 server 和 tool 名称。

---

## 四、目录规划

### 4.0 MCP 运行时配置目录全景

```
~/.workmate/  (Windows: D:\.workmate\)

┌─────────────────────────────────────────────────────────────────────────┐
│                          配置目录                                      │
│                                                                        │
│  chat-tools.json          ★ 工具开关 + 凭据 + 自定义工具定义           │
│    ├── toolStates: {            每个工具的启用/禁用 (跨 Chat+Agent)     │
│    │     "memory":              { enabled: true  },                   │
│    │     "web-search":          { enabled: false },                   │
│    │     "nano-banana":         { enabled: false },                   │
│    │     "custom-weather":      { enabled: true  },   ← Tool Builder  │
│    │     "custom-huatai-agent": { enabled: true  },   ← 预置          │
│    │   }                                                              │
│    ├── toolCredentials: {       非 memory 工具的 API Key               │
│    │     "nano-banana": { apiKey: "xxx" }                              │
│    │   }                                                              │
│    └── customTools: [           自定义 HTTP 工具完整定义               │
│          { id, name, params, httpConfig: { url, method, useEipAuth }}  │
│        ]                                                              │
│                                                                        │
│  plugins.json              ★ 插件启用/禁用 + MCP env 覆盖             │
│    ├── plugins: {                                                    │
│    │     "builtin:dpmp-assist": { enabled: true },                     │
│    │     "user:market/xxx":    { enabled: true, installedAt: "..." },  │
│    │   }                                                              │
│    └── mcpServers: {           用户对插件 MCP 的环境变量追加           │
│          "builtin:dpmp-assist/drawio": { env: { TOKEN: "abc" } }       │
│        }                                                              │
│                                                                        │
│  plugin-marketplaces.json ★ 插件市场列表                               │
│    └── marketplaces: [{ id, name, source, type: "github|gitee|raw" }]  │
│                                                                        │
│  agent-workspaces/{slug}/  ★ 工作区配置                               │
│    ├── mcp.json             工作区级 MCP 服务器                        │
│    │   └── servers: {        stdio/http/sse 类型 MCP 配置               │
│    │         "email": {      ← huatai-email-setup Skill 安装的         │
│    │           type: "stdio",                                         │
│    │           command: "mcp-email-server", args: ["stdio"],          │
│    │           env: { IMAP_HOST:"...", PASSWORD:"..." }               │
│    │         }                                                        │
│    │       }                                                          │
│    ├── skills/              工作区 Skills (从 default-skills 拷贝)     │
│    └── .claude-plugin/plugin.json  SDK 识别用 manifest                │
│                                                                        │
│  automations.json           ★ 定时任务数据 (automation MCP)            │
│    └── automations: [{ id, name, prompt, scheduleType, nextRunAt }]    │
│                                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                          插件目录                                      │
│                                                                        │
│  default-plugins/           ★ 内置插件 (随版本发布)                     │
│    └── {plugin}/                                                       │
│        ├── .claude-plugin/plugin.json  ← SDK 识别插件身份              │
│        ├── .mcp.json                   ← MCP 服务器定义                │
│        │   └── mcpServers: {                                           │
│        │         "drawio": {                                           │
│        │           type: "stdio", command: "...", env: {...}            │
│        │         }                                                    │
│        │       }                                                      │
│        ├── skills/{name}/SKILL.md       ← 插件 Skill                   │
│        ├── commands/{name}.md           ← 斜杠命令                     │
│        └── expert-groups/{name}.json    ← 专家团配置                   │
│                                                                        │
│  user-plugins/               ★ 用户安装插件 (git clone 自市场)         │
│    └── {marketplace}/{plugin}/                                         │
│        └── (同 default-plugins 结构)                                   │
│                                                                        │
│  runtime-plugins/            ★ 插件运行时副本 (有 env 覆盖时拷贝)       │
│    └── {pluginId}/                                                     │
│        └── .mcp.json         ← 已合并用户 env 的副本                   │
│                                                                        │
│  plugin-marketplace-cache/  ★ 市场 manifest 缓存                       │
│    └── {marketplaceId}/manifest.json                                   │
│                                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                          源码目录                                      │
│                                                                        │
│  apps/electron/src/main/lib/                                          │
│    ├── chat-tools/           Chat 工具 + Agent MCP 桥接               │
│    │   ├── http-tool-executor.ts  Chat 自定义 HTTP 执行器              │
│    │   ├── http-custom-mcp.ts     Agent MCP 桥接 (🆕 本次新增)        │
│    │   ├── nano-banana-tool.ts    Chat 生图                           │
│    │   ├── nano-banana-mcp.ts     Agent 生图 MCP                      │
│    │   ├── web-search-tool.ts     Chat 联网搜索                       │
│    │   ├── web-search-mcp.ts      Agent 联网搜索 MCP                  │
│    │   ├── memory-tool.ts         Chat 记忆                           │
│    │   └── agent-recommend-tool.ts                                     │
│    │                                                                   │
│    ├── agent-orchestrator.ts    ★ Agent 编排核心 (所有 MCP 注入入口)  │
│    ├── automation-agent-tools.ts  ★ Agent 定时任务 MCP                │
│    ├── automation-manager.ts       定时任务 CRUD                       │
│    ├── automation-scheduler.ts     定时调度 (setInterval 30s)          │
│    ├── plugin-registry-service.ts  插件注册表 (扫描.mcp.json)          │
│    ├── plugin-marketplace-service.ts 插件市场 (刷新/搜索/安装)        │
│    ├── mcp-validator.ts            MCP 启动前校验                      │
│    ├── feishu-bridge.ts            飞书桥接 (含 feishu_chat MCP)      │
│    ├── agent-expert-group-manager.ts 专家团 MCP                        │
│    └── agent-workspace-manager.ts  工作区 + mcp.json 读写             │
│                                                                        │
│  apps/electron/default-skills/   Agent Skills (对话触发)               │
│    ├── tool-builder/SKILL.md     ★ 自定义工具创建 Skill                │
│    ├── huatai-email-setup/        华泰邮箱安装向导                     │
│    └── ...                                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.1 加载到 SDK 的完整数据流

```
Agent 会话启动 → agent-orchestrator.run()
    │
    ├─────────────────────────────────────────────────────────────────────┐
    │                                                                     │
    │  ########  路径 1: mcpServers 字段 (显式注入到 SDK)  ########      │
    │                                                                     │
    │  ① buildMcpServers(workspaceSlug)                                   │
    │     ┌─────────────────────────────────────────────────────────┐    │
    │     │  读取: agent-workspaces/{slug}/mcp.json                  │    │
    │     │  转换为: { email: { type:'stdio', command:'...' } }      │    │
    │     └─────────────────────────────────────────────────────────┘    │
    │     ↓                                                              │
    │  ② injectMemoryTools(sdk, mcpServers)                               │
    │     ┌─────────────────────────────────────────────────────────┐    │
    │     │  读取: memory-service → memory.json                      │    │
    │     │  sdk.createSdkMcpServer('mem', [search_memory, add_memory])  │
    │     └─────────────────────────────────────────────────────────┘    │
    │     ↓                                                              │
    │  ③ injectNanoBananaTools(sdk, mcpServers)                           │
    │     ┌─────────────────────────────────────────────────────────┐    │
    │     │  读取: chat-tools.json → toolStates['nano-banana']       │    │
    │     │        chat-tools.json → toolCredentials['nano-banana']  │    │
    │     │  if enabled && apiKey:                                    │    │
    │     │    sdk.createSdkMcpServer('nano-banana', [generate_image])│    │
    │     └─────────────────────────────────────────────────────────┘    │
    │     ↓                                                              │
    │  ④ injectWebSearchTools(sdk, mcpServers)                            │
    │     ┌─────────────────────────────────────────────────────────┐    │
    │     │  sdk.createSdkMcpServer('workmate-web-search', [web_search]) │
    │     │  复用 web-search-tool.ts 的 executeWebSearchTool()       │    │
    │     └─────────────────────────────────────────────────────────┘    │
    │     ↓                                                              │
    │  ⑤ injectAutomationMcpServer(sdk, mcpServers)                       │
    │     ┌─────────────────────────────────────────────────────────┐    │
    │     │  sdk.createSdkMcpServer('automation', [                   │    │
    │     │    list/get/create/update/delete/runNow                 │    │
    │     │  ])                                                      │    │
    │     │  读取: automations.json                                  │    │
    │     └─────────────────────────────────────────────────────────┘    │
    │     ↓                                                              │
    │  ⑥ 🆕 injectHttpCustomMcpServer(sdk, mcpServers)                   │
    │     ┌─────────────────────────────────────────────────────────┐    │
    │     │  读取: chat-tools.json → customTools[]                   │    │
    │     │        chat-tools.json → toolStates[id].enabled          │    │
    │     │  if 无工具 → return (零注入)                              │    │
    │     │  sdk.createSdkMcpServer('proma-custom-http', [           │    │
    │     │    custom_weather, custom_huatai_agent, ...              │    │
    │     │  ])                                                      │    │
    │     │  复用 http-tool-executor.ts 的 executeHttpTool()         │    │
    │     └─────────────────────────────────────────────────────────┘    │
    │     ↓                                                              │
    │  ⑦ expertRuntime?.mcpServers                                        │
    │     ┌─────────────────────────────────────────────────────────┐    │
    │     │  读取: 专家团插件 → expert-groups/{name}.json            │    │
    │     └─────────────────────────────────────────────────────────┘    │
    │     ↓                                                              │
    │  ⑧ customMcpServers (运行时注入)                                    │
    │     ┌─────────────────────────────────────────────────────────┐    │
    │     │  feishu-bridge.ts → createFeishuChatMcpServer(chatId)    │    │
    │     │    sdk.createSdkMcpServer('feishu_chat', [fetch_history])│    │
    │     └─────────────────────────────────────────────────────────┘    │
    │                                                                     │
    ├─────────────────────────────────────────────────────────────────────┤
    │                                                                     │
    │  ########  路径 2: plugins 字段 (SDK 自动发现)  ########           │
    │                                                                     │
    │  getAgentPluginPaths(workspaceSlug)                                 │
    │    ├─ 工作区路径: agent-workspaces/{slug}/                          │
    │    │   └─ SDK 自动扫描 .claude-plugin/plugin.json                  │
    │    │      → skills/  → 自动注册 Skill                              │
    │    │                                                               │
    │    └─ buildPluginRuntimePaths()                                     │
    │        │                                                            │
    │        ├─ plugin-registry-service.ts                                │
    │        │   ├─ 扫描 default-plugins/ + user-plugins/                │
    │        │   ├─ 读取 plugins.json → enabled/filtered                 │
    │        │   ├─ 发现每个插件的 .mcp.json                              │
    │        │   │   └─ stdio: 命令转 { type:'stdio', command, args, env }│
    │        │   │   └─ http/sse: URL 转 { type, url, headers }          │
    │        │   ├─ 有 env 覆盖? → 拷贝到 runtime-plugins/               │
    │        │   └─ 返回 PluginRuntimePath[]                              │
    │        │                                                            │
    │        └─ 最终: SDK 拿到 plugins: [                                │
    │              { type:'local', path:'agent-workspaces/{slug}' },      │
    │              { type:'local', path:'default-plugins/dpmp-assist' },   │
    │              { type:'local', path:'runtime-plugins/xxx' },          │
    │            ]                                                        │
    │            SDK 自动扫描每个 path → .claude-plugin/plugin.json       │
    │              → skills/  → 注册 Skill                                │
    │              → .mcp.json → 注册 MCP (stdio spawn / http 远程)       │
    │              → commands/ → 注册 Command                             │
    │                                                                     │
    ├─────────────────────────────────────────────────────────────────────┤
    │                                                                     │
    │  ########  最终汇入  ########                                      │
    │                                                                     │
    │  claude-agent-adapter.ts L827                                       │
    │  sdk.query({                                                        │
    │    prompt: ...,                                                     │
    │    options: {                                                       │
    │      mcpServers: {       ← 路径 1 全部产物                          │
    │        'mem':                    进程内 MCP                        │
    │        'nano-banana':            进程内 MCP (if enabled)            │
    │        'workmate-web-search':    进程内 MCP                        │
    │        'automation':             进程内 MCP                        │
    │        'proma-custom-http':      进程内 MCP (🆕)                   │
    │        'email':                  stdio 子进程 (if configured)      │
    │        'feishu_chat':            进程内 MCP (运行时注入)           │
    │        ...expertRuntime          专家团 MCP                        │
    │      },                                                            │
    │      plugins: [              ← 路径 2 全部产物                      │
    │        { type:'local', path: workspacePath },                       │
    │        { type:'local', path: pluginRuntimePath1 },                  │
    │        { type:'local', path: pluginRuntimePath2 },                  │
    │      ],                                                            │
    │    }                                                               │
    │  })                                                                │
    │                                                                     │
    └─────────────────────────────────────────────────────────────────────┘
```

### 4.2 配置文件 ↔ 代码 ↔ SDK 的对应关系

| 配置文件 | 谁读它 | 注入路径 | SDK 字段 |
|----------|--------|---------|:--:|
| `chat-tools.json` → toolStates | nano-banana-mcp, http-custom-mcp | `mcpServers` | `mcpServers` |
| `chat-tools.json` → toolCredentials | nano-banana-mcp | `mcpServers` | `mcpServers` |
| `chat-tools.json` → customTools | chat-tool-registry (Chat) + http-custom-mcp (Agent) | `mcpServers` | `mcpServers` |
| `agent-workspaces/{slug}/mcp.json` | agent-orchestrator buildMcpServers() | `mcpServers` | `mcpServers` |
| `automations.json` | automation-agent-tools | `mcpServers` | `mcpServers` |
| `plugins.json` → plugins | plugin-registry-service listInstalledPlugins() | `plugins` | `plugins` |
| `plugins.json` → mcpServers | plugin-registry-service buildPluginMcpServers() | `plugins` | `plugins` |
| `default-plugins/{p}/.mcp.json` | SDK 自动发现 | `plugins` | `plugins` |
| `user-plugins/{p}/.mcp.json` | SDK 自动发现 | `plugins` | `plugins` |
| `runtime-plugins/{p}/.mcp.json` | SDK 自动发现 | `plugins` | `plugins` |
| `plugin-marketplaces.json` | plugin-marketplace-service (刷新/搜索/安装) | — | — (不直接注入) |

### 4.3 源码目录方案：放入 `chat-tools/`

```
apps/electron/src/main/lib/chat-tools/
    ├── http-tool-executor.ts      ← Chat 端（已有）
    ├── http-custom-mcp.ts         ← Agent 端（🆕 新增）
    ├── nano-banana-tool.ts        ← Chat 端
    ├── nano-banana-mcp.ts         ← Agent 端
    ├── web-search-tool.ts         ← Chat 端
    ├── web-search-mcp.ts          ← Agent 端
    ├── memory-tool.ts             ← Chat 端
    └── agent-recommend-tool.ts    ← Chat 端
```

### 4.4 这个方案的理由

| 考量 | 说明 |
|------|------|
| **一致性** | nano-banana / web-search 都是 `xxx-tool.ts` + `xxx-mcp.ts` 成对放置 |
| **可发现性** | 改 http-tool-executor 时，旁边的 mcp 文件自然会被看到 |
| **耦合度** | http-custom-mcp 强依赖 executeHttpTool()，放同一目录合理 |
| **不与 automation 混** | automation 和 chat-tools.json 无关，独立放根目录合理；custom 强依赖 chat-tools.json |

### 4.5 不放其他位置的理由

| 候选位置 | 为什么不选 |
|----------|-----------|
| `lib/http-custom-mcp.ts` | 和 chat-tools/ 不在一起，执行器在另一个目录 |
| `lib/mcp/http-custom-mcp.ts` | 过度切分，mcp/ 目录还不存在，只有 3 个 mcp 文件没必要 |
| `lib/agent-tools/http-custom-mcp.ts` | 和 automation-agent-tools.ts 混在一起，但它和 automation 不相关 |

---

## 五、上下文优化对比

### 5.1 v1 设计 vs v2 设计

| 维度 | v1 | v2 |
|------|:--:|:--:|
| 无自定义工具时 | 注入空 server（但仍有 server 注册开销） | **不注入**，零 token 消耗 |
| description 约束 | 无 | SKILL.md 约束两句话以内 |
| systemPromptAppend | 未讨论 | **不注入**到 Agent 模式 |
| toolStates 关系 | 仅过滤 | **强调开关就是 token 预算管理** |

### 5.2 一个典型工具的 token 构成

```
mcp__proma-custom-http__custom_weather
description: "查询指定城市当前天气和温度信息。当用户询问天气时调用。"
parameters:
  city: string - "城市名称（英文）"
  unit: string? - "温度单位（celsius/fahrenheit）"
────────────────────────────────────────────
总计约 70 tokens
```

10 个这样的工具约 700 tokens，在 200K 上下文中占比不到 0.35%。

---

## 六、边界情况

| 场景 | 行为 |
|------|------|
| 没有自定义工具 | 不注入 server，零开销 |
| 全部工具禁用 | 同上 |
| 只有 1 个工具 | 注入 1 个 tool 的 server |
| 10+ 个工具 | 全部注入（token 可控） |
| 同一会话新增工具 | 下一轮自动生效（每个 turn 重建 mcpServers） |
| 工具 id 含特殊字符 | SDK 自动处理 |
| HTTP 超时/失败 | 错误信息返回给 LLM，LLM 可告知用户 |
| EIP Token 过期 | 请求 401，错误信息返回给 LLM |

---

## 七、修改范围

| 文件 | 操作 | 改动量 |
|------|------|--------|
| `apps/electron/src/main/lib/chat-tools/http-custom-mcp.ts` | **新增** | ~80 行 |
| `apps/electron/src/main/lib/agent-orchestrator.ts` | **修改** | +2 行 |
| `apps/electron/default-skills/tool-builder/SKILL.md` | **修改** | description 约束说明 |

**总计：1 个新文件，2 个文件各改几行。**

---

## 九、Mermaid 架构全景图

```mermaid
flowchart TB
    subgraph RuntimeFiles["运行时配置文件 (~/.workmate/)"]
        CTJ["chat-tools.json<br/>toolStates + creds + customTools"]
        PJ["plugins.json<br/>plugins + mcpServers env"]
        PMJ["plugin-marketplaces.json"]
        MJ["agent-workspaces/{slug}/mcp.json<br/>servers: email 等"]
        AJ["automations.json"]
    end

    subgraph PluginDirs["插件目录"]
        DP["default-plugins/<br/>.mcp.json + skills/"]
        UP["user-plugins/<br/>.mcp.json + skills/"]
        RP["runtime-plugins/<br/>合并 env 的副本"]
        PC["plugin-marketplace-cache/"]
    end

    subgraph PromaCode["Proma 代码 (apps/electron/src/main/lib/)"]
        ORC["agent-orchestrator.ts ★<br/>run() → 构建 mcpServers + plugins"]
        NBM["nano-banana-mcp.ts"]
        WSM["web-search-mcp.ts"]
        ATM["automation-agent-tools.ts"]
        HCM["http-custom-mcp.ts 🆕"]
        MEM["memory (orchestrator 内联)"]
        BMS["buildMcpServers()"]
        PRS["plugin-registry-service.ts"]
        PMS["plugin-marketplace-service.ts"]
        GAP["getAgentPluginPaths()"]
    end

    subgraph External["运行时注入"]
        FB["feishu-bridge.ts<br/>feishu_chat MCP"]
        EG["expertRuntime<br/>专家团 MCP"]
        CM["customMcpServers<br/>外部传入"]
    end

    subgraph SDK["Claude Agent SDK"]
        QUERY["sdk.query({<br/>  prompt,<br/>  options: {<br/>    mcpServers,<br/>    plugins<br/>  }<br/>})"]
    end

    %% 路径 1: mcpServers
    MJ --> BMS
    BMS --> ORC
    CTJ -->|"toolStates + creds"| NBM
    CTJ -->|"customTools + states"| HCM
    AJ --> ATM
    NBM -->|"mcpServers['nano-banana']"| ORC
    WSM -->|"mcpServers['workmate-web-search']"| ORC
    ATM -->|"mcpServers['automation']"| ORC
    HCM -->|"mcpServers['proma-custom-http']"| ORC
    MEM -->|"mcpServers['mem']"| ORC
    FB -->|"运行时注入"| ORC
    EG -->|"运行时注入"| ORC
    CM -->|"运行时注入"| ORC

    %% 路径 2: plugins
    PJ --> PRS
    DP --> PRS
    UP --> PRS
    PRS -->|"enabled + env merge"| RP
    PRS --> GAP
    GAP -->|"PluginRuntimePath[]"| ORC

    %% 市场
    PMJ --> PMS
    PMS -->|"git clone"| UP
    PC --> PMS

    %% 汇入 SDK
    ORC -->|"queryOptions: { mcpServers, plugins }"| QUERY

