# 连接器（Connector）体系设计

> 版本：v3.1
> 日期：2026-06-22
> 状态：迭代中

***

## 一、连接器概念

### 1.1 连接器定义

**连接器（Connector）**：负责管理"哪些能力被 Claude SDK 扫描到"，分为两类：

1. **内置连接器**：代码内置的 SDK 工具（记忆、生图、搜索等），通过 `chat-tool.json` 管理启停
2. **外部连接器**：工作区级别的 MCP Server 或 CLI 工具，通过 `connectors/` 目录管理

### 1.2 连接器职责

1. **管理工作区连接器目录**：控制 MCP、CLI 等是否扫给 Claude SDK
2. **管理内置连接器**：通过 `chat-tool.json` 管理内置连接器的启停状态

***

## 二、目录结构

### 2.1 工作区连接器目录

```
~/.workmate/agent-workspaces/{slug}/
├── connectors/                    # ← 新增：连接器总目录
│   ├── connectors.json            # ← 新增：总配置文件，管理所有连接器状态
│   ├── huatai-email/             # ← MCP 类型连接器（目录名 huatai-email）
│   │   └── mcp.json              #   标准 MCP 配置
│   └── feishu-cli/               # ← CLI 类型连接器
│       └── skill/                 #   CLI 相关 Skill 目录
│           └── SKILL.md
├── skills/                        # ← 已有：其他 Skills
├── skills-inactive/               # ← 已有：禁用的 Skills
└── mcp.json.bak                   # ← 迁移后备份（可选，迁移完成后生成）
```

### 2.2 预置连接器分发

```
apps/electron/
└── default-connectors/           # ← 新增：预置连接器模板
    ├── huatai-email/           # 目录名 huatai-email（对应前端 default-connectors.ts 的 id: 'personal-email'）
    │   ├── connector.json        #   元数据（displayName/description/version）
    │   └── mcp.json              #   MCP 配置模板
    └── feishu-cli/
        ├── connector.json
        └── skill/                #   CLI 相关 Skill
            └── SKILL.md
```

***

## 三、connectors.json 配置

### 3.1 总配置文件

```json
{
  "version": "1.0",
  "connectors": {
    "huatai-email": {
      "type": "mcp",
      "enabled": true,
      "displayName": "华泰邮箱",
      "description": "华泰证券企业邮箱 IMAP/SMTP",
      "source": "preset",
      "disabledTools": ["send_email", "delete_email"]
    },
    "feishu-cli": {
      "type": "cli",
      "enabled": true,
      "displayName": "飞书 CLI",
      "description": "飞书命令行工具（日历/消息/文档/云盘等）",
      "source": "preset",
      "skillDir": "skill"
    }
  }
}
```

### 3.2 字段说明

| 字段              | 类型        | 说明                                                     |
| --------------- | --------- | ------------------------------------------------------ |
| `type`          | string    | `"mcp"` 或 `"cli"`                                      |
| `enabled`       | boolean   | 是否扫给 Claude SDK                                        |
| `source`        | string    | `"preset"`（预置）或 `"user"`（用户添加）                         |
| `skillDir`      | string    | CLI 类型专用，Skill 所在子目录                                   |
| `disabledTools` | string\[] | MCP 类型专用：禁用的工具名列表（如 `["send_email"]`），SDK 级别不暴露给 Agent |

> **职责分离**：`connectors.json` 只管状态（`enabled`/`source`/`disabledTools`），子目录只管配置（`mcp.json` / `skill/`）。两个地方不会出现同一字段的重复。

> **工具级别禁用**：`disabledTools` 存放在 `connectors.json` 中，运行时由 `collectConnectorDisabledTools()` 转为 SDK 格式 `mcp__<connectorName>__<toolName>`，合并到 SDK 的 `disallowedTools` 中。典型场景：华泰邮箱默认禁用 `send_email`/`delete_email`，先只读运行，用户确认安全后再取消禁用。

***

## 四、外部连接器类型

### 4.1 MCP 类型连接器（华泰邮箱）

#### 目录结构

```
connectors/
└── huatai-email/
    ├── connector.json     # 元数据（预置模板用）
    ├── mcp.json           # 标准 MCP 配置
    └── skill/              # 可选：安装引导 Skill
        └── SKILL.md
```

#### mcp.json 格式（标准 MCP 格式）

```json
{
  "type": "stdio",
  "command": "mcp-email-server",
  "args": ["stdio"],
  "env": {
    "MCP_EMAIL_SERVER_ACCOUNT_NAME": "htsc",
    "MCP_EMAIL_SERVER_EMAIL_ADDRESS": "xxx@htsc.com",
    "MCP_EMAIL_SERVER_PASSWORD": "xxx",
    "MCP_EMAIL_SERVER_IMAP_HOST": "htemail.htsc.com.cn",
    "MCP_EMAIL_SERVER_IMAP_PORT": "993",
    "MCP_EMAIL_SERVER_IMAP_SSL": "true"
  }
}
```

#### 特点

- 直接注入 Claude SDK 作为 MCP Server
- 需要检测 pip 包是否安装（`mcp-email-server`）
- 如果未安装，可通过 Skill 引导用户安装
- 用户通过 UI 编辑 `mcp.json` 中的 `env` 字段

***

### 4.2 CLI 类型连接器（飞书 CLI）

#### 目录结构

```
connectors/
└── feishu-cli/
    └── skill/
        └── SKILL.md
        └── ... (其他 Skill 文件)
```

#### 特点

- 不注入 Claude SDK 作为 MCP Server
- **Skill 注入到 SDK**：连接器启用时，Skill 可被 SDK 扫描到
- Skill 负责自然语言翻译和执行 CLI 命令
- Skill 放在连接器目录下的 `skill/` 子目录中

***

## 五、预置连接器设计

### 5.1 预置连接器列表

1. **华泰邮箱**（MCP 类型，目录名 `huatai-email`，前端 `id: 'personal-email'`，保存到 `mcp.json` 的 server 名为 `email`）
   - 预置 `mcp.json` 配置模板（IMAP 只读模式）
   - UI：弹出邮箱绑定弹窗填写账号密码，点击配置后写入工作区 `mcp.json`
   - 依赖检测：检查 `mcp-email-server` pip 包是否安装
2. **飞书 CLI**（CLI 类型，前端 `id: 'feishu-cli'`）
   - 预置完整的 Skill（`feishu-lark-setup`）
   - UI：弹出飞书引导弹窗，引导到飞书开放平台完成授权
   - Skill 负责：安装 CLI、检查授权、翻译自然语言为 CLI 命令

### 5.2 预置连接器同步策略

**时机**：用户创建工作区时

1. 将 `default-connectors/` 中的内容复制到工作区 `connectors/` 目录
2. 检查 `connectors.json`，如果预置连接器不存在则添加（默认 `enabled: false`）
3. 已存在的预置连接器保留用户的 `enabled` 状态和配置

***

## 六、运行时加载

### 6.0 旧 mcp.json 迁移

启动时一次性迁移：如果工作区存在旧 `mcp.json` 且 `connectors/` 下没有迁移标记，自动迁移。

**迁移逻辑**：

```ts
function migrateMcpJsonToConnectors(workspaceSlug: string) {
  const mcpPath = getWorkspaceMcpPath(workspaceSlug)
  const connectorsDir = getConnectorsDir(workspaceSlug)
  const configPath = join(connectorsDir, 'connectors.json')

  // 已迁移则跳过
  if (existsSync(configPath)) return

  // 旧 mcp.json 不存在则跳过
  if (!existsSync(mcpPath)) return

  const oldConfig = JSON.parse(readFileSync(mcpPath, 'utf-8'))
  const connectors: Record<string, ConnectorEntry> = {}

  for (const [name, entry] of Object.entries(oldConfig.servers ?? {})) {
    if (name === 'memos-cloud') continue // 系统保留，不迁移
    const dir = join(connectorsDir, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'mcp.json'), JSON.stringify(entry, null, 2))
    connectors[name] = {
      type: 'mcp',
      enabled: entry.enabled ?? false,
      source: entry.isBuiltin ? 'preset' : 'user',
      displayName: name,
    }
  }

  writeFileSync(configPath, JSON.stringify({ version: '1.0', connectors }, null, 2))
  // 保留旧 mcp.json 作为备份（重命名），不删除
  renameSync(mcpPath, mcpPath + '.bak')
}
```

### 6.1 内置连接器

保持现有逻辑，通过 `chat-tool.json` 的 `toolStates` 管理：

```ts
const memoryState = getToolState('memory')
if (memoryState.enabled) {
  injectMemoryTools(sdk, mcpServers)
}
```

### 6.2 外部连接器

#### 6.2.1 MCP 类型

读取 `connectors/{name}/mcp.json`，如果 `enabled: true` 则注入 SDK：

```ts
function buildMcpServersFromConnectors(workspaceSlug: string) {
  const connectorsConfig = readConnectorsConfig(workspaceSlug)
  const mcpServers = {}

  for (const [name, config] of Object.entries(connectorsConfig.connectors)) {
    if (!config.enabled) continue
    if (config.type !== 'mcp') continue

    // 检测依赖是否安装（如 pip 包）
    const dependenciesOk = checkMcpDependencies(workspaceSlug, name)
    if (!dependenciesOk) continue

    const mcpConfig = readMcpConfig(workspaceSlug, name)
    mcpServers[name] = mcpConfig
  }

  return mcpServers
}
```

**依赖检测机制**（以华泰邮箱为例）：

1. 检查 `mcp-email-server` 是否通过 pip 安装
2. 如果未安装，UI 显示提示，引导用户使用 Skill 安装
3. 安装成功后，自动启用连接器

***

#### 6.2.2 CLI 类型

不注入 MCP Server，但 **Skill 注入到 SDK**。

**实现方式**：在 SDK query options 中传入额外的 skill 目录路径，SDK 会扫描 `connectors/` 下所有子目录中的 `skill/`（仅当对应连接器 `enabled: true` 时生效）：

```ts
// 构建 SDK query 时传入 additionalSkillDirs
const connectorDir = getConnectorsDir(workspaceSlug)
const sdkOptions = {
  // ... 现有 options
  additionalSkillDirs: [connectorDir],
}
```

**不复制/链接**：直接让 SDK 扫描连接器目录下的 skill，保持文件结构清晰。

**效果**：

- 飞书 CLI 连接器启用 → SDK 扫描到 `connectors/feishu-cli/skill/` 中的 Skill
- 用户在对话中提到飞书相关操作 → Skill 被激活

***

## 七、UI 改造方案

### 7.1 现有前端架构

连接器管理分布在两个入口：

| 入口             | 现有位置                              | 管理内容              |
| -------------- | --------------------------------- | ----------------- |
| **Settings 页** | `AgentSettings.tsx` → "内置工具"      | 内置连接器（记忆/生图/联网搜索） |
| **Agent 技能视图** | `AgentSkillsView.tsx` → "连接器" Tab | 外部连接器（MCP + CLI）  |

**现状**：

- "Agent 技能"视图已包含「专家 / 技能 / 连接器」三个 Tab（`capability-tabs.ts`）
- 连接器 Tab 内部值 `'mcp'`，展示标签已是"连接器"
- 预置连接器通过 `DefaultConnectorCard` 渲染，带"默认"标签
- 空状态文案："还没有连接器"，按钮："添加服务器"
- 已有 `HuataiEmailConnectorDialog`（邮箱绑定）和 `FeishuCliConnectorDialog`（飞书 CLI 引导）

### 7.2 文案修改项

| 位置             | 当前文案       | 修改为            | 说明         |
| -------------- | ---------- | -------------- | ---------- |
| Tab 内部值        | `'mcp'`    | `'connectors'` | 类型重命名，标签不变 |
| 添加按钮           | `添加服务器`    | `添加连接器`        | 统一术语       |
| 空状态            | `还没有连接器`   | 保持不变           | -          |
| 搜索 placeholder | `搜索连接器...` | 保持不变           | -          |

### 7.3 连接器 Tab 布局（目标态）

```
┌──────────────────────────────────────────────────────┐
│  Agent 技能                          [AI 配置] [添加连接器] │
├──────────────────────────────────────────────────────┤
│   [专家]  [技能]  [连接器]    🔍 搜索连接器...          │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ 📧 华泰邮箱               默认               │   │  ← DefaultConnectorCard
│  │    邮件服务                                   │   │     (预置·未配置)
│  │    绑定华泰邮箱后读取邮件...              →   │   │
│  ├──────────────────────────────────────────────┤   │
│  │ 🐦 飞书 CLI               默认               │   │  ← DefaultConnectorCard
│  │    办公协同                                   │   │     (预置·未配置)
│  │    通过飞书开放平台接入...                →   │   │
│  ├──────────────────────────────────────────────┤   │
│  │ 🔌 my-mcp-server    [stdio]  [已启用] [···]  │   │  ← McpCard
│  │    my-custom-command                         │   │     (用户·已配置)
│  │                              [内置] [连接正常] │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

> **改造点**：
>
> - 预置连接器（`DefaultConnectorCard`）增加类型标识：MCP 类型（如个人邮箱）vs CLI 类型（如飞书 CLI）
> - MCP 类型的预置连接器跳转邮箱绑定弹窗（已有），CLI 类型跳转飞书引导弹窗（已有）
> - MCP 类型的预置连接器配置完成后变为普通 `McpCard`，可编辑/删除
> - CLI 类型的预置连接器启用后，Skill 被 SDK 扫描到

### 7.4 AgentSettings 内置工具布局（目标态）

```
┌──────────────────────────────────────────────────────┐
│  Agent 配置                                          │
├──────────────────────────────────────────────────────┤
│                                                      │
│  内置工具                      [配置]                 │
│  启用后自动注入到 Agent 会话                          │
│  ┌──────────────────────────────────────────────┐   │
│  │ 🧠 记忆                          已启用       │   │
│  │    长期记忆存储与检索                          │   │
│  ├──────────────────────────────────────────────┤   │
│  │ 🎨 Nano Banana                   需配置       │   │
│  │    AI 图片生成与编辑                            │   │
│  ├──────────────────────────────────────────────┤   │
│  │ 🌐 联网搜索                       未启用       │   │
│  │    实时搜索互联网获取最新信息                    │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

> 内置连接器通过 `chat-tools.json` 的 `toolStates` 管理启停，已有的 UI 不变。

### 7.5 交互规则

| 操作           | 内置连接器            | 外部连接器（MCP） | 外部连接器（CLI）                           |
| ------------ | ---------------- | ---------- | ------------------------------------ |
| 启用/禁用        | ✅（AgentSettings） | ✅（连接器 Tab） | ✅（连接器 Tab）                           |
| 编辑配置         | -                | ✅          | -                                    |
| 安装依赖检测       | -                | ✅          | -                                    |
| Skill 注入 SDK | -                | -          | ✅（enabled 时扫描 `connectors/*/skill/`） |
| 删除           | -                | ✅          | ✅                                    |
| 添加           | -                | ✅          | ✅                                    |
| 解绑           | -                | -          | ✅（清除 CLI 凭据）                        |

### 7.6 Agent 对话模式连应用 Popover（AgentConnectorPicker）

在 Agent 对话输入框上方点击「连应用」按钮弹出 Popover，展示当前可用的连接器列表：

**状态与交互**：

| 连接器状态                 | 右侧显示                  | 点击行为                     |
| ----------------------- | --------------------- | ------------------------ |
| 已配置 + 已启用（emerald 绿） | Switch 开关（绿色）        | 切换启用/禁用                 |
| 已配置 + 未启用（灰）          | Switch 开关（灰色）        | 切换启用/禁用                 |
| 未配置                    | 「连接」按钮              | 跳转到 Agent 技能 → 连接器管理页配置 |
| 敬请期待                   | 灰色文字「敬请期待」+ 不可点击    | -                        |

**解绑入口**：飞书 CLI 的解绑操作统一放在 Agent 技能 → 连接器 Tab 的 `DefaultConnectorCard` 中，Agent 对话模式下的 Popover 不提供解绑入口。

***

## 八、文件改动清单

| 文件                           | 改动类型 | 说明                                                                                                                          |
| ---------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `config-paths.ts`            | 新增   | `getConnectorsDir()`、`getDefaultConnectorsDir()`、`seedDefaultConnectors()`                                                  |
| `agent-workspace-manager.ts` | 修改   | 新增 `readConnectorsConfig()`、`migrateMcpJsonToConnectors()`、预置连接器同步                                               |
| `agent-orchestrator.ts`      | 修改   | `buildMcpServers()` 从 `connectors/` 加载 MCP；SDK options 传入 `additionalSkillDirs`；合并连接器级别 `disabledTools` 到 `disallowedTools` |
| `mcp-builder.ts`             | 修改   | 新增 `collectConnectorDisabledTools()`，转为 SDK `mcp__<name>__<tool>` 格式                                                        |
| `feishu-device-auth.ts`      | 修改   | 飞书 CLI 认证（`connectWithAppSecret`）+ 解绑（`unbindFeishuCli`）：清除 `~/.lark-cli/config.json` 与 Registry 凭据                   |
| `ipc.ts`                     | 修改   | 新增连接器相关的 IPC 接口（含 `UNBIND_FEISHU_CLI`）                                                                                    |
| `AgentConnectorPicker.tsx`   | 重构   | Agent 对话模式下连应用 Popover：已配置显示 Switch（绿/灰），未配置显示「连接」按钮          |
| `AgentSkillsView.tsx`        | 修改   | 连接器 Tab 中 `DefaultConnectorCard` 增加飞书 CLI 解绑按钮（Unplug 图标）                                                                 |
| `electron-builder.yml`       | 修改   | 添加 `default-connectors/` 到 `extraResources`                                                                                 |
| `default-connectors/`        | 新增   | 预置连接器模板目录                                                                                                                   |
| 前端 AgentSettings             | 修改   | 文案调整（添加服务器→添加连接器）、Tab 内部值重命名                                                                                                |

***

## 九、设计决策

| 决策                  | 选择                                              | 理由                         |
| ------------------- | ----------------------------------------------- | -------------------------- |
| 连接器目录统一管理           | ✅ `connectors/` 总目录                             | 结构清晰，便于管理                  |
| 状态 vs 配置分离          | ✅ `connectors.json` 管状态，子目录管配置                  | 无重复字段，职责单一                 |
| 旧 mcp.json 处理       | ✅ 一次性迁移，备份 `.bak`                               | 不丢数据，之后只读新格式               |
| MCP 配置方式            | ✅ 标准 `mcp.json` 格式                              | 兼容现有生态                     |
| CLI Skill 存放        | ✅ 连接器目录下的 `skill/`                              | 与连接器绑定，便于分发和管理             |
| CLI Skill 注入方式      | ✅ SDK `additionalSkillDirs` 传入路径                | SDK 扫描连接器目录，按 enabled 过滤  |
| 飞书 CLI 认证           | ✅ App ID + App Secret 换 token，存 `~/.lark-cli/` + Registry | 兼容 lark-cli 原生格式 |
| 飞书 CLI 解绑           | ✅ `unbindFeishuCli()` 删配置 + Registry              | 用户可主动清除凭据，配 UI 入口         |
| 预置连接器同步时机           | ✅ 打开/切换工作区时                                     | 按需同步，避免启动阻塞                |
| 预置连接器默认状态           | ✅ `enabled: false`                              | 避免默认注入过多能力                 |
| MCP 工具级别禁用          | ✅ 连接器级别 `disabledTools` → SDK `disallowedTools` | 细粒度安全控制（如邮箱先只读后 SMTP）      |

---

## 九、设计文档与代码差异对照（当前实现 vs v3.1 设计）

> 以下记录设计文档与 2026-06-22 实际代码之间的关键差异，及本次修改的核心点。

### 9.1 预置连接器目录 `connector.json` 结构简化

**设计文档**描述：`huatai-email/` 目录下有 `connector.json`（元数据）+ 单独的 `mcp.json`（MCP 配置）。

**实际代码**：[default-connectors/huatai-email/connector.json](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/default-connectors/huatai-email/connector.json) 把 `mcpServer` 字段内嵌在同一个 `connector.json` 中，不拆成两个文件。

```json
{
  "displayName": "华泰邮箱",
  "mcpServer": {
    "type": "stdio",
    "command": "mcp-email-server",
    ...
  }
}
```

**差异原因**：减少预置模板的文件数量，简化分发。工作区迁移时仍按 `connectors/{name}/mcp.json` 生成标准结构。

### 9.2 飞书 CLI OAuth 实现与设计文档的差异

飞书 CLI 有两阶段认证流程（设计文档中未描述）：

| 项目 | 设计文档 | 实际代码 |
|------|---------|---------|
| 请求设备码 API | `POST /authen/v1/device_token` | `POST /oauth/v1/device_authorization` |
| 轮询 Token API | `POST /authen/v1/oidc/access_token` | `POST /open-apis/authen/v2/oauth/token` |
| 认证阶段 | 单阶段 | **两阶段**：Phase 1 可能拿不到 refresh_token，自动发起 Phase 2 |
| IPC 名称 | `REQUEST_FEISHU_DEVICE_CODE` | `START_FEISHU_DEVICE_AUTH` + `REGISTER_FEISHU_APP` |
| IPC 名称 | `POLL_FEISHU_DEVICE_TOKEN` | `POLL_FEISHU_DEVICE_AUTH` |
| App 注册 | 未提及 | 通过 `larksuiteoapi/node-sdk` 的 `registerApp()` + QR 码流注册 |

### 9.3 `skillDir` → `skillDirs` 字段名变更

设计文档 `connectors.json` 使用 `skillDir`（单数字符串），实际代码 [agent.ts types](file:///d:/code/workmate/dev/AiWorkbench/packages/shared/src/types/agent.ts#L791) 使用 `skillDirs`（复数数组 `string[]`）。

**原因**：一个 CLI 连接器可能有多个 Skill 子目录。

### 9.4 运行时依赖检测简化

设计文档 6.2.1 节描述了"加载时检查 pip 依赖"的伪代码，实际代码的 `buildMcpServers()` 不检查依赖——依赖检测前置到连接器初始化阶段（`initializeDefaultConnector`），运行时直接加载。

### 9.5 迁移 source 字段

设计文档迁移逻辑使用 `entry.isBuiltin ? 'preset' : 'user'`，实际 [agent-workspace-manager.ts](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/src/main/lib/agent-workspace-manager.ts) 中 `migrateMcpJsonToConnectors()` 统一使用 `'user'`，因为旧 `mcp.json` 格式不含 `isBuiltin` 字段。

### 9.6 本次修改核心点

| 修改项 | 文件 | 说明 |
|--------|------|------|
| 消除重复 | `packages/shared/src/utils/huatai-email.ts` | `buildHuataiEmailMcpEntry` 从两处重复代码收敛到 `@proma/shared` 单一实现 |
| 消除重复 | `apps/electron/src/renderer/.../default-connectors.ts` | 改为 `export { buildHuataiEmailMcpEntry } from '@proma/shared'` 重新导出 |
| 消除重复 | `apps/electron/src/main/lib/default-connector-initializer.ts` | 改为 `import { buildHuataiEmailMcpEntry } from '@proma/shared'` |
| 异步化 | `apps/electron/src/main/lib/mcp-validator.ts` | `isCommandAvailable` 从 `execSync` 同步阻塞改为 `execFile` 异步 Promise |

