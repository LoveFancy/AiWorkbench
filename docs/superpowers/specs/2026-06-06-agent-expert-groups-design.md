# Agent 专家团设计方案

## 背景

WorkMate 当前 Agent 模式已经具备以下基础能力：

- 通过 `agent-orchestrator.ts` 统一构建 SDK query options。
- 通过 `agent-prompt-builder.ts` 追加 WorkMate 自定义系统提示词。
- 通过 SDK `agents` 选项注册内置 SubAgent。
- 通过工作区 `skills/`、`.claude-plugin/plugin.json`、全局 plugin registry 注入 Skills、Agent、Command、MCP 能力。
- 通过 `AgentSessionMeta` 记录会话的 workspace、channel、permission mode 等运行上下文。

用户希望实现类似 WorkBuddy 的“专家团”能力：在 Agent 模式下召唤某个专家团，专家团包含主角色、多个辅角色、Skills、Tools、MCP 等能力；召唤专家团时必须新建会话，并在新会话中替换当前 WorkMate Agent 的主角色提示词，由主角色调度辅角色完成任务。

## 核心判断

专家团不应该独立于 plugin 另起一套能力系统。更合适的定义是：

```text
plugin = 能力包 / 分发包
专家团 = plugin 能力的一种高级编排形态
```

也就是说：

- plugin 负责安装、分发、启用能力。
- expert group 负责把 plugin 中的主角色、SubAgent、Skills、MCP、Tools 组织成一个可召唤的 Agent 运行画像。
- Agent session 负责绑定某一次专家团运行实例。

因此，专家团应该建立在 WorkMate 现有 plugin registry、SDK plugins、SDK agents、workspace skills、MCP 注入机制之上。

## 目标

1. Agent 模式支持“召唤专家团”。
2. 选择专家团时必须创建新 Agent 会话。
3. 新会话持久绑定专家团，不能在同一个 SDK session 中途切换专家团。
4. Orchestrator 根据会话绑定的专家团动态组装：
   - 主角色 system prompt
   - SubAgent definitions
   - plugin paths
   - Skills / Commands / Agents 能力
   - MCP servers
   - 工具权限策略
5. 保留 WorkMate 通用 Agent 运行规则，包括中文输出、工作区路径、计划模式、记忆系统、权限系统、文件检查点等。
6. 第一版只支持 plugin 提供的专家团；内置专家团也以内置 plugin 的形式提供，不设置单独的专家团目录。

## 非目标

第一版不实现以下能力：

- 专家团市场独立系统。
- 专家团可视化编排器。
- 当前会话中途切换专家团。
- 每个专家团独立 workspace。
- 复杂工具权限矩阵 UI。
- 多专家团同时绑定同一会话。

这些能力可以在专家团基础能力稳定后再扩展。

## 术语

| 术语 | 含义 |
| --- | --- |
| Plugin | WorkMate/CC 风格能力包，包含 skills、agents、commands、MCP 等 |
| Expert Group | 专家团，描述一个主角色和一组辅角色、技能、工具的编排 |
| Main Role | 专家团主角色，替换默认 WorkMate Agent 角色 prompt |
| SubAgent | SDK `agents` 中可被主角色调用的辅角色 |
| Skill | `skills/<name>/SKILL.md` 描述的可触发工作流 |
| Tool | SDK 内置工具、MCP 工具、WorkMate 权限控制下的工具集合 |
| Session Binding | Agent 会话绑定专家团 ID，决定运行时配置 |

## 专家团与 Plugin 的关系

推荐目录结构：

```text
plugin-root/
  .claude-plugin/
    plugin.json
  skills/
    prd-writer/
      SKILL.md
  agents/
    requirement-analyst.md
    ux-designer.md
    tech-reviewer.md
  commands/
  .mcp.json
  expert-groups/
    product-team.json
```

`plugin.json` 继续作为插件元信息，不直接承载专家团复杂配置。专家团配置放在 `expert-groups/*.json`，这样可以让一个 plugin 提供多个专家团。

`plugin.json` 增加可选的 `expertGroups` 快速索引字段，用于插件列表和专家团列表的快速发现。该字段只作为索引，运行时仍必须校验对应的 `expert-groups/*.json` 文件存在且合法。

```json
{
  "name": "product-experts",
  "version": "0.1.0",
  "description": "产品专家团能力包",
  "expertGroups": [
    "product-team"
  ]
}
```

发现规则：

1. 优先读取 `plugin.json` 中的 `expertGroups` 索引。
2. 对索引中声明的每个 ID，校验 `expert-groups/{id}.json`。
3. 如果插件存在 `expert-groups/*.json` 但未在 `plugin.json` 声明，仍可扫描并记录 warning，提示插件补充索引字段。
4. plugin 处于禁用状态时，其专家团不进入可召唤列表。

示例：

```json
{
  "id": "product-team",
  "name": "产品专家团",
  "description": "由产品负责人、需求分析师、交互设计师和技术评审组成的产品协作专家团",
  "mainRole": {
    "name": "产品负责人",
    "prompt": "你是产品专家团的主角色，负责理解用户目标、拆解任务、调度子专家，并输出可执行的产品方案。"
  },
  "subagents": [
    "requirement-analyst",
    "ux-designer",
    "tech-reviewer"
  ],
  "skills": [
    "prd-writer"
  ],
  "mcpServers": [
    "dpmp"
  ],
  "toolsPolicy": {
    "mode": "inherit"
  }
}
```

## 数据模型

### Shared 类型

在 `packages/shared/src/types/agent.ts` 增加专家团相关类型：

```ts
export interface AgentExpertGroupMainRole {
  name: string
  prompt: string
}

export interface AgentExpertGroupToolsPolicy {
  mode: 'inherit' | 'restrict'
  allowedTools?: string[]
}

export interface AgentExpertGroupManifest {
  id: string
  name: string
  description?: string
  mainRole: AgentExpertGroupMainRole
  subagents?: string[]
  skills?: string[]
  mcpServers?: string[]
  toolsPolicy?: AgentExpertGroupToolsPolicy
}

export interface AgentExpertGroupInfo extends AgentExpertGroupManifest {
  sourcePluginId?: string
  sourceLabel: string
  filePath: string
  enabled: boolean
}
```

同时扩展 `AgentPluginManifest`：

```ts
export interface AgentPluginManifest {
  name: string
  version: string
  description?: string
  expertGroups?: string[]
}
```

### AgentSessionMeta 扩展

在 `AgentSessionMeta` 增加：

```ts
expertGroupId?: string
expertPluginId?: string
```

语义：

- `expertGroupId`：当前会话绑定的专家团 ID。
- `expertPluginId`：专家团来源插件 ID；内置专家团也来自内置 plugin，因此同样写入插件 ID。
- 普通 Agent 会话不设置这两个字段。
- 绑定字段创建后不允许直接修改；如需切换专家团，必须新建会话。

不可变约束必须由主进程服务层强制执行。`updateAgentSessionMeta()` 不接受 `expertGroupId` 和 `expertPluginId` 更新；只有 `createAgentSession()` 可以在创建时写入。UI 层也需要禁用“切换当前会话专家团”的入口，但 UI 拦截不是唯一保护。

## 存储位置

专家团只有一个来源：plugin。

```text
~/.proma/user-plugins/<market>/<plugin>/
  expert-groups/*.json

~/.proma/default-plugins/<plugin>/
  expert-groups/*.json

apps/electron/bundled-plugins/<plugin>/
  expert-groups/*.json
```

内置专家团以内置 plugin 形式提供，例如：

```text
apps/electron/bundled-plugins/workmate-experts/
  .claude-plugin/
    plugin.json
  agents/
  skills/
  expert-groups/
    product-team.json
```

第一版不设置 `default-expert-groups/` 目录，避免和 plugin 扫描逻辑分叉。

## 主进程服务

新增：

```text
apps/electron/src/main/lib/agent-expert-group-manager.ts
```

职责：

1. 扫描 plugin 专家团，包括内置 plugin 和用户 plugin。
2. 校验专家团 JSON 结构。
3. 根据 `expertGroupId + expertPluginId` 解析专家团。
4. 将专家团配置转成运行时配置。
5. 向 IPC 提供专家团列表和详情。

核心接口：

```ts
export function listAgentExpertGroups(): AgentExpertGroupInfo[]

export function getAgentExpertGroup(
  input: { expertGroupId: string; expertPluginId?: string }
): AgentExpertGroupInfo | undefined

export function resolveExpertGroupRuntime(
  input: ResolveExpertGroupRuntimeInput
): ExpertGroupRuntime | null
```

运行时结构：

```ts
export interface ExpertGroupRuntime {
  group: AgentExpertGroupInfo
  mainPrompt: string
  agents: Record<string, AgentDefinition>
  pluginPaths: Array<{ type: 'local'; path: string }>
  mcpServers: Record<string, McpServerEntry>
  promptHints: string[]
  allowedTools?: string[]
}
```

## Orchestrator 动态组装

动态组装发生在 `agent-orchestrator.ts` 构建 `queryOptions` 前。

流程：

```text
runAgent(input)
  -> getAgentSessionMeta(sessionId)
  -> resolveExpertGroupRuntime(sessionMeta)
  -> buildSystemPrompt(ctx + expertRuntime)
  -> buildAgentsForSession(builtinAgents + expertRuntime.agents)
  -> mergePluginPaths(workspacePlugins + expertRuntime.pluginPaths)
  -> mergeMcpServers(workspaceMcp + expertRuntime.mcpServers + customMcpServers)
  -> queryOptions
  -> SDK query()
```

伪代码：

```ts
const sessionMeta = getAgentSessionMeta(sessionId)

const expertRuntime = resolveExpertGroupRuntime({
  expertGroupId: sessionMeta?.expertGroupId,
  expertPluginId: sessionMeta?.expertPluginId,
  workspaceSlug,
  claudeAvailable,
})

const systemPrompt = buildSystemPrompt({
  workspaceName: workspace?.name,
  workspaceSlug,
  sessionId,
  permissionMode: initialPermissionMode,
  memoryEnabled,
  claudeAvailable,
  deepSeekSubagentModel: modelRouting.subagentModel,
  expertRuntime,
})

const agents = buildAgentsForSession({
  claudeAvailable,
  expertRuntime,
})

const pluginPaths = mergePluginPaths({
  workspaceSlug,
  expertRuntime,
})

const mcpServers = mergeMcpServers({
  workspaceMcpServers,
  expertRuntime,
  customMcpServers,
})

const queryOptions = {
  sessionId,
  prompt: finalPrompt,
  model: modelId || DEFAULT_MODEL_ID,
  cwd: agentCwd,
  systemPrompt: {
    type: 'preset',
    preset: 'claude_code',
    append: systemPrompt,
  },
  agents,
  plugins: pluginPaths,
  mcpServers,
}
```

## Prompt 组装策略

当前 `buildSystemPrompt()` 固定注入默认 WorkMate 主角色。专家团改造后：

```ts
if (ctx.expertRuntime) {
  sections.push(buildExpertMainRolePrompt(ctx.expertRuntime))
  sections.push(buildExpertModeSummary(ctx.expertRuntime))
  sections.push(buildExpertDelegationPrompt(ctx.expertRuntime))
} else {
  sections.push(buildDefaultWorkMateAgentPrompt())
  sections.push(buildDefaultSubagentDelegationPrompt(ctx))
}
```

无论是否使用专家团，都继续保留：

- 中文输出规则
- 工具使用指南
- 联网检索策略
- 工作区路径说明
- 计划模式说明
- 记忆系统说明
- 文档输出与知识管理规则
- 任务完成标准
- 交互规范

专家团只替换主角色和 SubAgent 调度说明，不替换 WorkMate 的底层运行规则。

`buildExpertModeSummary()` 需要明确告诉主角色当前处于专家团模式，并列出可调度资源：

```text
## 专家团模式

- 当前专家团: 产品专家团
- 主角色: 产品负责人
- 可调度 SubAgent:
  - requirement-analyst: 需求分析
  - ux-designer: 交互方案
  - tech-reviewer: 技术可行性评审
- 推荐 Skills:
  - prd-writer: 输出 PRD 时优先使用
- 可用 MCP:
  - dpmp: 创建和管理 Story
```

## SubAgent 合并策略

当前内置 SubAgent 包括：

- `explorer`
- `researcher`
- `code-reviewer`

专家团 SubAgent 合并规则：

```text
expertRuntime.agents > builtinAgents
```

如果专家团定义同名 SubAgent，覆盖内置定义。这样专家团可以提供更专业的 `researcher` 或 `code-reviewer`。

专家团 SubAgent 只走一条运行路径：WorkMate 解析 plugin `agents/*.md`，转换为 SDK `AgentDefinition`，再通过 SDK `agents` option 显式注册。

不依赖 SDK plugin 自动发现 agents 作为专家团运行时来源，因为 WorkMate 需要统一控制：

- prompt
- tools
- model
- maxTurns
- DeepSeek 非 Claude 模型兼容
- UI 展示
- 测试覆盖

如果 SDK plugin 机制也发现了同名 agent，专家团运行时以 `expertRuntime.agents` 为准；WorkMate 在构建 runtime 时按名称去重，并记录 warning，避免同名 SubAgent 出现两份定义。

## Skills 和 Commands

Skills 与 Commands 不需要手动拼进 system prompt。专家团需要确保相关 plugin path 被传给 SDK：

```ts
plugins: [
  ...workspacePluginPaths,
  ...expertRuntime.pluginPaths,
]
```

Prompt 中只注入“何时使用这些能力”的调度说明，例如：

```text
当需要输出 PRD 时，优先调用 prd-writer Skill。
当需要创建 DPMP Story 时，优先使用 dpmp-assist 插件提供的能力。
```

这样可以避免把 Skill 全文重复塞进 system prompt。

`AgentExpertGroupManifest.skills` 字段的运行时作用固定为三类：

1. **校验**：确认专家团声明的关键 Skill 在来源 plugin 的 `skills/` 下存在。
2. **UI 展示**：在专家团详情中展示“推荐 Skills / 依赖 Skills”。
3. **调度提示**：生成简短 prompt hints，告诉主角色何时优先使用这些 Skills。

该字段不负责注册 Skills。Skill 注册仍由 SDK plugin path 完成。

## MCP 合并策略

MCP 来源优先级：

```text
customMcpServers > expertRuntime.mcpServers > workspaceMcpServers
```

说明：

- `customMcpServers` 是飞书、桥接等入口临时注入的运行时 MCP，优先级最高。
- `expertRuntime.mcpServers` 来自专家团依赖的 plugin `.mcp.json`。
- `workspaceMcpServers` 是工作区已有配置。

如果名称冲突，优先级高的一方覆盖低优先级配置，并用 `console.warn` 记录中文日志。专家团详情页应展示 MCP 冲突 issue，便于用户在设置中处理；第一版不需要在运行时弹出额外确认。

## 工具权限策略

第一版只支持两种策略：

```ts
mode: 'inherit' | 'restrict'
```

- `inherit`：继承当前 WorkMate permission mode 和 safe tools 策略。
- `restrict`：在 WorkMate 权限策略基础上进一步限制 `allowedTools`。

`restrict` 是 AND 逻辑：

```text
最终可用工具 = WorkMate 权限策略允许的工具 ∩ expertGroup.allowedTools
```

不支持专家团直接绕过权限。即使专家团声明强工具能力，也必须经过 WorkMate 现有 `agent-permission-service.ts`。

## UI 设计

专家团 UI 参考 WorkBuddy 的三段式体验，但适配 WorkMate 的 Agent 会话模型：

```text
看到专家团 -> 理解它能做什么 -> 点击召唤 -> 自动新建专家会话
```

第一版提供两个入口：

1. **Agent 主界面：召唤专家**，用于快速创建专家团会话。
2. **设置页：专家团**，用于查看内置和插件提供的专家团、诊断配置问题、从详情页召唤专家团。

两个入口使用同一套专家团数据，不区分两套发现逻辑。

### Agent 主界面入口

Agent 模式增加“召唤专家”入口，位置可以在 `AgentHeader` 或输入区左侧快捷入口：

```text
[ 通用 Agent ▾ ]    [召唤专家]    [当前工作区]    [模型选择]
```

默认状态显示“通用 Agent”。点击“召唤专家”后打开专家团选择面板。

### 专家团目录面板

目录面板参考 WorkBuddy 的专家卡片网格，但视觉上保持 WorkMate 工具型产品的信息密度。顶部提供分类、搜索和“我的专家”入口：

```text
[专家团] [技能] [连接器]                         [搜索专家团/角色/描述] [我的专家]

┌──────────────────────────────┐ ┌──────────────────────────────┐
│ 产品专家团                    │ │ 研发专家团                    │
│ 主角色：产品负责人             │ │ 主角色：技术负责人             │
│ 拆需求、写 PRD、生成 Story...   │ │ 架构设计、代码实现、Review...   │
│ [PRD] [Story] [需求分析]       │ │ [架构] [代码] [质量]           │
│ 3 SubAgents · 2 Skills · 1 MCP │ │ 4 SubAgents · 3 Skills         │
└──────────────────────────────┘ └──────────────────────────────┘
```

卡片字段：

- 专家团名称。
- 来源：`内置` / `插件：dpmp-assist`。
- 主角色名称。
- 一句话简介。
- 能力标签。
- 能力摘要：`3 SubAgents · 2 Skills · 1 MCP`。
- 状态：`可用` / `插件已禁用` / `配置异常`。

第一版只需要实现 `专家团` 分类。`技能`、`连接器` 和 `我的专家` 可以先显示为未来扩展入口或不展示，不进入 MVP 必须交付范围。

### 专家详情弹窗

点击专家团卡片后打开详情弹窗。详情弹窗用于解释能力、依赖和召唤后会发生什么：

```text
┌────────────────────────────────────────────┐
│ [图标] 产品专家团                         X │
│ 主角色：产品负责人   [内置] [产品协作]       │
│ 来源：workmate-experts                     │
│ 状态：可用                                 │
│                                            │
│ 能力介绍                                   │
│ 适合将模糊想法拆成需求、PRD、Story 和任务。 │
│                                            │
│ 适用场景                                   │
│ [需求澄清] [PRD 编写] [Story 创建]          │
│                                            │
│ 专家成员                                   │
│ 产品负责人 · requirement-analyst · ux...   │
│                                            │
│ 依赖能力                                   │
│ Skills: prd-writer, story-mapper           │
│ MCP: dpmp                                  │
│                                            │
│ 试试这样问                                 │
│ > 帮我把这个想法整理成 PRD                 │
│ > 基于这份需求创建 DPMP Story              │
│ > 帮我评审这个交互方案                     │
│                                            │
│              [召唤产品专家团]              │
└────────────────────────────────────────────┘
```

详情弹窗必须展示来源和状态，因为专家团来自 plugin，运行可用性依赖 plugin 状态和配置完整性。

异常态示例：

```text
状态：不可用
原因：来源插件已禁用
操作：[去插件管理启用]
```

### 召唤中状态

点击“召唤专家团”后进入召唤中状态，不在当前会话切换角色，而是创建新会话：

```text
正在召唤产品专家团...
正在创建专家会话
正在加载 SubAgent / Skills / MCP
```

召唤流程：

```text
点击召唤
  -> 创建新 Agent 会话
  -> 写入 expertGroupId / expertPluginId
  -> 切换到新会话
  -> 显示专家团模式欢迎状态
```

加载态可以使用轻量居中遮罩，避免长时间全屏阻塞。创建成功后进入新会话，标题临时为 `{专家团名称} · 新任务`，首轮用户消息后复用现有自动标题生成逻辑。

### 设置页专家团菜单

设置页新增 Agent 模式专属菜单：

```text
SKILL/MCP
专家团
插件管理
```

`专家团` 设置页是 catalog 和诊断入口，不是唯一召唤入口。页面按来源和状态分组：

```text
专家团
[搜索专家团/角色/描述]

内置专家团
- 产品专家团       可用     workmate-experts
- 研发专家团       可用     workmate-experts

插件专家团
- DPMP 交付专家团  可用     dpmp-assist
- 数据分析专家团   异常     data-plugin

异常
- 运营专家团       插件已禁用
```

每个条目展示：

- 名称。
- 来源 plugin。
- 来源类型：内置 / 用户安装。
- 状态。
- SubAgent / Skill / MCP 数量。
- 操作：`查看详情`、`召唤`、`打开来源插件`。

### 专家团状态

UI 状态模型：

```ts
type ExpertGroupStatus =
  | 'available'
  | 'plugin_disabled'
  | 'plugin_uninstalled'
  | 'invalid_manifest'
  | 'missing_subagent'
  | 'missing_skill'
  | 'mcp_conflict'
```

展示文案：

```text
可用
插件已禁用
来源插件已卸载
配置错误
缺少子专家
缺少技能
连接器冲突
```

### 视觉风格

- 参考 WorkBuddy 的“卡片目录 + 详情弹窗 + 召唤中状态”，但不照搬大圆角和营销式卡片。
- WorkMate 采用工具型布局，信息密度略高，卡片圆角控制在 8px 左右。
- 使用 `lucide-react` 图标，例如 `Users`、`Bot`、`Puzzle`、`Plug`、`ShieldCheck`。
- 状态颜色保持克制：可用用中性/绿色，异常用橙/红。
- 卡片只放摘要，详情弹窗承载完整说明和依赖诊断。

### 推荐组件拆分

```text
apps/electron/src/renderer/components/agent/
  ExpertSummonButton.tsx
  ExpertGroupPicker.tsx
  ExpertSummoningOverlay.tsx

apps/electron/src/renderer/components/settings/
  ExpertGroupSettings.tsx

apps/electron/src/renderer/components/expert-groups/
  ExpertGroupCard.tsx
  ExpertGroupDetailDialog.tsx
  ExpertGroupStatusBadge.tsx
```

交互规则：

1. 当前会话不能直接切换专家团。
2. 如果用户在普通会话里选择专家团，系统创建新会话。
3. 如果用户在专家团会话里选择另一个专家团，系统创建另一个新会话。
4. 专家团会话可以继续使用当前 workspace、channel、model。
5. 会话标题创建时临时使用 `{专家团名称} · 新任务`。
6. 首轮用户消息发送后，继续复用现有 Agent 自动标题生成逻辑，用首条消息摘要替换临时标题。

## IPC 设计

新增 IPC channels：

```ts
AGENT_EXPERT_GROUP_IPC_CHANNELS = {
  LIST: 'agent-expert-group:list',
  GET: 'agent-expert-group:get',
}
```

扩展创建会话接口：

```ts
createAgentSession(
  title?: string,
  channelId?: string,
  workspaceId?: string,
  expertGroupId?: string,
  expertPluginId?: string,
)
```

`createAgentSession(input: CreateAgentSessionInput)` 对象参数重构不放入专家团 MVP。该重构可以作为独立前置或后续改动，避免扩大专家团 PR 的 review 范围。

## 状态管理

`agent-atoms.ts` 新增：

```ts
agentExpertGroupsAtom
currentAgentExpertGroupAtom
loadAgentExpertGroupsAtom
createExpertSessionAtom
```

状态使用 Jotai，符合项目约束。

`settings-tab.ts` 新增：

```ts
'experts'
```

`settings-tabs.tsx` 在 Agent 模式下新增 `专家团` 菜单，位置放在 `SKILL/MCP` 和 `插件管理` 之间：

```ts
const EXPERTS_TAB: TabItem = {
  id: 'experts',
  label: '专家团',
  icon: <Users size={16} />,
}
```

## 兼容性

普通会话兼容：

- 没有 `expertGroupId` 的历史会话继续按默认 WorkMate Agent 运行。
- 历史 `agent-sessions.json` 不需要迁移。
- 读取 `expertGroupId` 时做 optional 处理。

Plugin 兼容：

- 没有 `expert-groups/` 的 plugin 继续作为普通 plugin。
- 有 `expert-groups/` 的 plugin 额外展示专家团能力。
- plugin 启用状态为 false 时，其专家团不可召唤。
- plugin 被禁用后，已绑定该专家团的历史会话仍可打开和查看，但不能继续发送新消息；重新启用 plugin 后恢复运行。
- plugin 被卸载后，已绑定该专家团的历史会话保留元数据和消息记录；继续发送时提示专家团来源已不可用，不自动降级为普通 Agent。

## 错误处理

1. 专家团配置 JSON 解析失败：
   - plugin 列表中展示 warning/error。
   - 不展示为可召唤专家团。

2. 会话绑定的专家团已被删除：
   - 会话仍可打开。
   - 发送消息前提示用户专家团不可用。
   - 不自动降级为普通 Agent，避免角色语义漂移。

3. 会话绑定的专家团来源 plugin 被禁用：
   - 会话仍可打开。
   - 发送消息前提示用户先启用来源 plugin。
   - 不自动切换为普通 Agent。

4. 会话绑定的专家团来源 plugin 被卸载：
   - 会话仍可打开。
   - 发送消息前提示来源 plugin 已卸载。
   - 保留 `expertGroupId/expertPluginId` 作为历史标记。

5. 专家团引用的 subagent 不存在：
   - 专家团不可召唤。
   - 设置页展示具体缺失项。

6. 专家团引用的 MCP 未配置凭据：
   - 专家团可以召唤。
   - 运行时保留 MCP，但 MCP 自身测试状态在 UI 提示。
   - 工具调用失败时走现有 SDK 错误展示。

## 测试计划

### 单元测试

新增测试：

- `agent-expert-group-manager.test.ts`
  - 扫描 plugin `expert-groups/*.json`
  - 过滤无效专家团
  - 解析 subagent 引用
  - 解析 MCP 引用

- `agent-prompt-builder.test.ts`
  - 普通会话 prompt 不变
  - 专家团会话替换主角色 prompt
  - WorkMate 通用规则仍保留
  - 专家团调度说明正确注入
  - 专家团模式摘要包含 SubAgent、Skills、MCP 清单

- `agent-orchestrator.test.ts`
  - 专家团 agents 合并
  - 同名 SubAgent 去重并以专家团定义优先
  - plugin paths 合并
  - MCP 优先级合并
  - `toolsPolicy.restrict` 使用 AND 逻辑收紧工具
  - 缺失专家团时报错

- `agent-session-manager.test.ts`
  - 创建专家团会话写入 `expertGroupId`
  - `updateAgentSessionMeta()` 拒绝修改专家团绑定字段
  - 历史会话读取兼容

### UI 测试

- 专家团列表加载。
- Agent 主界面“召唤专家”入口可打开专家团目录。
- 专家团卡片可打开详情弹窗。
- 详情弹窗展示来源、状态、SubAgent、Skills、MCP。
- 点击专家团后创建新会话。
- 召唤中状态展示，并在创建完成后切换到新会话。
- 当前会话不被原地切换。
- 会话列表显示专家团标签。
- 设置页新增 `专家团` 菜单。
- 设置页按内置、插件、异常状态展示专家团。

### 回归测试

- 普通 Agent 发送消息。
- 默认内置 SubAgent 仍可用。
- workspace skills 仍可加载。
- plugin settings 仍能展示普通 plugin 能力。

## 实施步骤

1. 增加 shared 类型。
2. 增加 `agent-expert-group-manager.ts`。
3. 扩展 plugin registry，发现 `expert-groups/` 能力。
4. 扩展会话创建和 `AgentSessionMeta`。
5. 扩展 prompt builder，支持 expert runtime。
6. 扩展 orchestrator，合并 agents、plugins、mcp、tools policy。
7. 增加 IPC 和 preload API。
8. 增加 Jotai atoms。
9. 增加 Agent UI 选择入口。
10. 增加设置页 `专家团` 菜单。
11. 增加测试。

## 推荐 MVP

第一版只交付：

- plugin 下 `expert-groups/*.json` 扫描。
- `plugin.json` 可选 `expertGroups` 快速索引。
- 专家团列表 UI。
- Agent 主界面“召唤专家”入口。
- 专家团详情弹窗。
- 召唤中状态。
- 设置页 `专家团` 菜单。
- 选择专家团新建会话。
- 会话绑定 `expertGroupId/expertPluginId`。
- 后端强制专家团绑定不可变。
- 主角色 prompt 替换。
- SubAgent 合并。
- plugin paths 注入。
- MCP 合并。
- 禁用/卸载 plugin 后的历史会话保护。
- 基础测试。

暂不交付：

- 专家团编辑器。
- 专家团市场。
- 专家团导入导出。
- 复杂权限矩阵。
- 专家团运行统计。
- `技能`、`连接器` 和 `我的专家` 独立页面。

## 设计结论

专家团应该作为 plugin 能力的高级编排形态实现。WorkMate 不需要新增一套独立的专家运行时，而是复用现有 Agent SDK、plugin registry、skills、agents、MCP、permission service 和 prompt builder。

最终形态是：

```text
用户召唤专家团
  -> WorkMate 创建新 Agent 会话
  -> 会话绑定 expertGroupId / expertPluginId
  -> Orchestrator 解析专家团 runtime
  -> Prompt Builder 替换主角色并注入调度说明
  -> SDK agents 注册专家团 SubAgent
  -> SDK plugins 注入专家团 Skills / Commands / Agents
  -> MCP 合并专家团工具
  -> 主角色负责调度辅角色完成任务
```

这个方案改动集中、兼容现有架构，并且为后续专家团市场、可视化编排、团队共享 plugin 留出了空间。
