# Agent 专家团设计方案

## 背景

Proma 当前 Agent 模式已经具备以下基础能力：

- 通过 `agent-orchestrator.ts` 统一构建 SDK query options。
- 通过 `agent-prompt-builder.ts` 追加 Proma 自定义系统提示词。
- 通过 SDK `agents` 选项注册内置 SubAgent。
- 通过工作区 `skills/`、`.claude-plugin/plugin.json`、全局 plugin registry 注入 Skills、Agent、Command、MCP 能力。
- 通过 `AgentSessionMeta` 记录会话的 workspace、channel、permission mode 等运行上下文。

用户希望实现类似 WorkBuddy 的“专家团”能力：在 Agent 模式下召唤某个专家团，专家团包含主角色、多个辅角色、Skills、Tools、MCP 等能力；召唤专家团时必须新建会话，并在新会话中替换当前 Proma Agent 的主角色提示词，由主角色调度辅角色完成任务。

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

因此，专家团应该建立在 Proma 现有 plugin registry、SDK plugins、SDK agents、workspace skills、MCP 注入机制之上。

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
5. 保留 Proma 通用 Agent 运行规则，包括中文输出、工作区路径、计划模式、记忆系统、权限系统、文件检查点等。
6. 第一版支持内置专家团和 plugin 提供的专家团，不做复杂可视化编辑器。

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
| Plugin | Proma/CC 风格能力包，包含 skills、agents、commands、MCP 等 |
| Expert Group | 专家团，描述一个主角色和一组辅角色、技能、工具的编排 |
| Main Role | 专家团主角色，替换默认 Proma Agent 角色 prompt |
| SubAgent | SDK `agents` 中可被主角色调用的辅角色 |
| Skill | `skills/<name>/SKILL.md` 描述的可触发工作流 |
| Tool | SDK 内置工具、MCP 工具、Proma 权限控制下的工具集合 |
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

### AgentSessionMeta 扩展

在 `AgentSessionMeta` 增加：

```ts
expertGroupId?: string
expertPluginId?: string
```

语义：

- `expertGroupId`：当前会话绑定的专家团 ID。
- `expertPluginId`：专家团来源插件 ID；内置专家团可以省略或使用 `builtin:<name>`。
- 普通 Agent 会话不设置这两个字段。
- 绑定字段创建后不允许直接修改；如需切换专家团，必须新建会话。

## 存储位置

支持两类专家团来源：

```text
apps/electron/default-expert-groups/
  product-team.json

~/.proma/user-plugins/<market>/<plugin>/
  expert-groups/*.json

~/.proma/default-plugins/<plugin>/
  expert-groups/*.json
```

第一版优先扫描 plugin 下的 `expert-groups/`。内置专家团可以作为内置 plugin 的一部分提供，也可以用 `default-expert-groups/` 作为过渡。

## 主进程服务

新增：

```text
apps/electron/src/main/lib/agent-expert-group-manager.ts
```

职责：

1. 扫描内置专家团和 plugin 专家团。
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

当前 `buildSystemPrompt()` 固定注入默认 Proma 主角色。专家团改造后：

```ts
if (ctx.expertRuntime) {
  sections.push(buildExpertMainRolePrompt(ctx.expertRuntime))
  sections.push(buildExpertDelegationPrompt(ctx.expertRuntime))
} else {
  sections.push(buildDefaultPromaAgentPrompt())
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

专家团只替换主角色和 SubAgent 调度说明，不替换 Proma 的底层运行规则。

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

如果专家团只引用 plugin `agents/*.md`，有两种实现路径：

1. 由 SDK plugin 自动发现 agents。
2. Proma 解析 `agents/*.md` 并转成 SDK `AgentDefinition`。

第一版建议采用第二种作为主路径，因为 Proma 可以统一控制：

- prompt
- tools
- model
- maxTurns
- DeepSeek 非 Claude 模型兼容
- UI 展示
- 测试覆盖

SDK plugin 自动发现能力可以保留，但不作为专家团运行时的唯一依据。

## Skills 和 Commands

Skills 与 Commands 不需要手动拼进 system prompt。专家团只需要确保相关 plugin path 被传给 SDK：

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

## MCP 合并策略

MCP 来源优先级：

```text
customMcpServers > expertRuntime.mcpServers > workspaceMcpServers
```

说明：

- `customMcpServers` 是飞书、桥接等入口临时注入的运行时 MCP，优先级最高。
- `expertRuntime.mcpServers` 来自专家团依赖的 plugin `.mcp.json`。
- `workspaceMcpServers` 是工作区已有配置。

如果名称冲突，优先级高的一方覆盖低优先级配置，并记录一条中文日志。

## 工具权限策略

第一版只支持两种策略：

```ts
mode: 'inherit' | 'restrict'
```

- `inherit`：继承当前 Proma permission mode 和 safe tools 策略。
- `restrict`：在 Proma 权限策略基础上进一步限制 `allowedTools`。

不支持专家团直接绕过权限。即使专家团声明强工具能力，也必须经过 Proma 现有 `agent-permission-service.ts`。

## UI 设计

Agent 模式增加“召唤专家”入口：

- 位置：`AgentHeader` 或输入区左侧快捷入口。
- 默认状态显示“通用 Agent”。
- 点击后展示专家团列表。
- 选择专家团后创建新 Agent 会话，并切换到该会话。
- 会话列表展示专家团标签。

交互规则：

1. 当前会话不能直接切换专家团。
2. 如果用户在普通会话里选择专家团，系统创建新会话。
3. 如果用户在专家团会话里选择另一个专家团，系统创建另一个新会话。
4. 专家团会话可以继续使用当前 workspace、channel、model。
5. 会话标题默认使用 `{专家团名称} · 新任务`。

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

也可以改成对象参数，减少后续扩展成本：

```ts
createAgentSession(input: CreateAgentSessionInput)
```

推荐第一版同步重构为对象参数，因为继续追加位置参数会降低可读性。

## 状态管理

`agent-atoms.ts` 新增：

```ts
agentExpertGroupsAtom
currentAgentExpertGroupAtom
loadAgentExpertGroupsAtom
createExpertSessionAtom
```

状态使用 Jotai，符合项目约束。

## 兼容性

普通会话兼容：

- 没有 `expertGroupId` 的历史会话继续按默认 Proma Agent 运行。
- 历史 `agent-sessions.json` 不需要迁移。
- 读取 `expertGroupId` 时做 optional 处理。

Plugin 兼容：

- 没有 `expert-groups/` 的 plugin 继续作为普通 plugin。
- 有 `expert-groups/` 的 plugin 额外展示专家团能力。
- plugin 启用状态为 false 时，其专家团不可召唤。

## 错误处理

1. 专家团配置 JSON 解析失败：
   - plugin 列表中展示 warning/error。
   - 不展示为可召唤专家团。

2. 会话绑定的专家团已被删除：
   - 会话仍可打开。
   - 发送消息前提示用户专家团不可用。
   - 不自动降级为普通 Agent，避免角色语义漂移。

3. 专家团引用的 subagent 不存在：
   - 专家团不可召唤。
   - 设置页展示具体缺失项。

4. 专家团引用的 MCP 未配置凭据：
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
  - Proma 通用规则仍保留
  - 专家团调度说明正确注入

- `agent-orchestrator.test.ts`
  - 专家团 agents 合并
  - plugin paths 合并
  - MCP 优先级合并
  - 缺失专家团时报错

- `agent-session-manager.test.ts`
  - 创建专家团会话写入 `expertGroupId`
  - 历史会话读取兼容

### UI 测试

- 专家团列表加载。
- 点击专家团后创建新会话。
- 当前会话不被原地切换。
- 会话列表显示专家团标签。

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
10. 增加测试。

## 推荐 MVP

第一版只交付：

- plugin 下 `expert-groups/*.json` 扫描。
- 专家团列表 UI。
- 选择专家团新建会话。
- 会话绑定 `expertGroupId/expertPluginId`。
- 主角色 prompt 替换。
- SubAgent 合并。
- plugin paths 注入。
- MCP 合并。
- 基础测试。

暂不交付：

- 专家团编辑器。
- 专家团市场。
- 专家团导入导出。
- 复杂权限矩阵。
- 专家团运行统计。

## 设计结论

专家团应该作为 plugin 能力的高级编排形态实现。Proma 不需要新增一套独立的专家运行时，而是复用现有 Agent SDK、plugin registry、skills、agents、MCP、permission service 和 prompt builder。

最终形态是：

```text
用户召唤专家团
  -> Proma 创建新 Agent 会话
  -> 会话绑定 expertGroupId / expertPluginId
  -> Orchestrator 解析专家团 runtime
  -> Prompt Builder 替换主角色并注入调度说明
  -> SDK agents 注册专家团 SubAgent
  -> SDK plugins 注入专家团 Skills / Commands / Agents
  -> MCP 合并专家团工具
  -> 主角色负责调度辅角色完成任务
```

这个方案改动集中、兼容现有架构，并且为后续专家团市场、可视化编排、团队共享 plugin 留出了空间。
