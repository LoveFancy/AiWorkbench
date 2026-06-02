# Proma 插件市场与完整插件机制设计方案

## 背景

Proma 当前已经具备一部分 Claude Agent SDK local plugin 能力：

- `apps/electron/default-skills/` 存放随应用发布的默认 Skill 模板。
- 启动时 `seedDefaultSkills()` 将默认 Skill 按 semver 同步到 `~/.proma/default-skills/`，工作区创建和升级时再注入到工作区 `skills/`。
- `apps/electron/bundled-plugins/` 存放随应用发布的内置插件。
- 启动时 `seedDefaultPlugins()` 将内置插件同步到 `~/.proma/default-plugins/`。
- Agent 启动时 `agent-orchestrator.ts` 会把当前工作区路径和 `~/.proma/default-plugins/*` 作为 SDK local plugin 注入。
- 当前 UI 主要管理工作区级 `skills/`、`mcp.json`，并有一个硬编码的华泰 SkillHub。

下一阶段目标不是用插件替代 Skill，而是明确支持双轨扩展模型：

- **单体 Skill 轨道**：继续支持默认 Skill、华泰 SkillHub、标准 `npx skills add`、工作区 `skills/` 安装与编辑。
- **完整 Plugin 轨道**：新增插件市场、插件安装、插件全局启用，以及插件里的 `skills`、`commands`、`agents`、`mcpServers` 等能力。

两条轨道都需要长期支持，最终在 Agent runtime 和 UI 能力展示中汇总，但安装位置、生命周期和升级策略保持独立。

## 目标

1. 保持单体 Skill 安装能力：默认 Skill、华泰 SkillHub、标准 Skills CLI、工作区 `skills/` 都继续支持。
2. 支持用户添加和管理插件市场。
3. 支持从插件市场发现、安装、更新、卸载插件。
4. 插件启用状态为全局，不与工作区绑定。
5. 启用插件后，插件里的 `skills`、`commands`、`agents` 全局可用。
6. 插件里的 MCP 随插件一起启用，需支持环境变量配置、安全提示、连接测试和错误展示。
7. 保留工作区私有能力：工作区仍可拥有自己的 `skills/`、`commands/`、`agents/`、`mcp.json`，作为项目级补充。
8. 在 UI 中清晰展示当前可用能力、来源、冲突和错误。

## 本阶段非目标

本阶段不做以下内容：

- 私有 GitHub 仓库认证。
- 插件签名和信任链校验。
- 多版本并存。
- 插件运行时代码扩展 Proma 前端 UI。
- 自动执行插件脚本。
- 每个工作区单独启用/禁用插件。
- 将 `default-skills/` 合并进 `default-plugins/`。
- 用插件市场替代华泰 SkillHub 或标准 Skills CLI。

## 核心概念

### 双轨扩展模型

Proma 扩展能力分为单体 Skill 和完整 Plugin 两条轨道：

| 轨道 | 安装目标 | 生命周期 | 运行时来源 | 典型入口 |
| --- | --- | --- | --- | --- |
| 单体 Skill | 当前工作区 `skills/` | 工作区级 | 当前工作区 local plugin | Agent 设置页 Skills、华泰 SkillHub、`npx skills add` |
| 完整 Plugin | `~/.proma/user-plugins/` 或 `~/.proma/default-plugins/` | 全局 | 启用插件 local plugin | 插件设置页、插件市场 |

两条轨道共存：

- 单体 Skill 适合一个独立能力、项目定制能力、从插件中提取后的可编辑副本。
- 完整 Plugin 适合成组能力分发，包含多个 skills、commands、agents、MCP 配置或配套文档。
- 单体 Skill 安装不会写入 `plugins.json`。
- Plugin 安装不会写入工作区 `skills/`，除非用户显式执行“提取 Skill 到当前工作区”。
- Agent 最终能力由当前工作区能力、启用插件能力和 Proma 动态能力共同组成。

### 插件

插件是 Proma 的应用级扩展单元。一个插件可以包含：

```text
plugin-root/
├── .claude-plugin/plugin.json
├── .claude-plugin/marketplace.json
├── skills/
├── commands/
├── agents/
├── .mcp.json
└── README.md
```

Proma 应以插件目录作为 SDK local plugin 注入单位，而不是把插件强制拆成 Skill。

### 插件市场

插件市场是插件索引来源，负责发现插件，不直接改变运行时能力。市场可以来自：

- GitHub 仓库，例如 `https://github.com/multica-ai/andrej-karpathy-skills`
- raw manifest URL
- 本地目录

市场 manifest 采用 Claude Code 风格：

```json
{
  "name": "karpathy-skills",
  "id": "karpathy-skills",
  "plugins": [
    {
      "name": "andrej-karpathy-skills",
      "source": "./",
      "description": "Behavioral guidelines...",
      "version": "1.0.0"
    }
  ]
}
```

插件 manifest 采用 `.claude-plugin/plugin.json`：

```json
{
  "name": "andrej-karpathy-skills",
  "description": "Behavioral guidelines...",
  "version": "1.0.0",
  "author": {
    "name": "Plugin Author"
  },
  "homepage": "https://example.com",
  "repository": "https://example.com/repo.git",
  "license": "MIT",
  "keywords": ["skills"]
}
```

`plugin.json` 在首版实现中只作为 metadata manifest。插件能力通过目录自动发现：

- `skills/`
- `commands/`
- `agents/`
- `.mcp.json`

首版不在 `plugin.json` 中新增 `skills`、`commands`、`agents`、`mcpServers` 声明字段，避免与现有 `dpmp-assist`、`superpowers` manifest 格式不兼容。若后续需要声明式能力索引，应作为 Proma manifest v2 单独设计，并继续兼容目录自动发现。

### 全局插件与工作区私有能力

插件启用是全局的。启用后所有 Agent 工作区都能使用该插件能力。

工作区私有能力仍然存在，用于放项目专属配置：

```text
~/.proma/agent-workspaces/default/
├── skills/
├── commands/
├── agents/
└── mcp.json
```

运行时可用能力等于：

```text
当前工作区单体 Skill 与私有能力
 全局启用插件能力
 Proma 内置动态能力
```

当前工作区单体 Skill 来源包括：

```text
default-skills 注入结果
+ 用户手动创建的工作区 Skill
+ 华泰 SkillHub 安装的 Skill
+ 标准 Skills CLI 安装后移动/复制到工作区的 Skill
```

插件能力来源包括：

```text
全局启用插件能力 + 当前工作区私有能力 + Proma 内置动态能力
```

两者互不绑定：

- 启用/禁用插件不会修改工作区目录。
- 切换工作区不会改变全局插件启用状态。
- 工作区私有能力只在当前工作区生效。
- 市场插件安装到全局用户插件目录，不安装到某个工作区。
- 单体 Skill 安装到当前工作区，不安装到全局用户插件目录。

## 本地目录与配置

建议新增以下路径：

```text
~/.proma/
├── default-skills/               # 默认 Skill 模板运行时副本（现有）
├── default-plugins/              # 内置插件运行时副本
├── user-plugins/                 # 用户从市场安装的插件
├── plugin-marketplaces.json      # 插件市场列表
├── plugins.json                  # 全局插件启用状态、插件 MCP env 和错误状态
└── plugin-marketplace-cache/     # 市场缓存
```

### plugin-marketplaces.json

```json
{
  "marketplaces": [
    {
      "id": "karpathy-skills",
      "name": "Karpathy Skills",
      "source": "https://github.com/multica-ai/andrej-karpathy-skills",
      "type": "github",
      "enabled": true,
      "addedAt": "2026-05-30T00:00:00.000Z",
      "lastRefreshAt": null
    }
  ]
}
```

### plugins.json

```json
{
  "plugins": {
    "builtin:dpmp-assist": {
      "enabled": true
    },
    "builtin:superpowers": {
      "enabled": true
    },
    "user:karpathy-skills/andrej-karpathy-skills": {
      "enabled": true,
      "installedAt": "2026-05-30T00:00:00.000Z",
      "sourceMarketplaceId": "karpathy-skills",
      "version": "1.0.0"
    }
  },
  "mcpServers": {
    "builtin:dpmp-assist/drawio": {
      "env": {}
    }
  }
}
```

### plugin-marketplace-cache/

市场缓存目录按 marketplace id 分隔，只缓存可重新获取的数据，不保存用户启用状态和凭据：

```text
~/.proma/plugin-marketplace-cache/
└── {marketplaceId}/
    ├── manifest.json             # 最近一次成功解析的 marketplace manifest
    ├── plugins.json              # 展平后的插件索引与能力摘要
    ├── last-error.json           # 最近一次刷新错误
    └── fetched-at.txt            # 最近一次成功刷新时间
```

缓存损坏时可以整体删除并重新拉取。权威状态仍以 `plugin-marketplaces.json`、`plugins.json` 和本地插件目录为准。

## 能力加载策略

### 插件路径注入

当前 `getAgentPluginPaths(workspaceSlug)` 和 `getBuiltinPluginPaths()` 应改为读取启用状态：

```text
当前工作区路径
+ 全局启用的内置插件路径
+ 全局启用的用户插件路径
```

示意：

```ts
plugins: [
  { type: 'local', path: getAgentWorkspacePath(workspaceSlug) },
  ...getEnabledBuiltinPluginPaths(),
  ...getEnabledUserPluginPaths()
]
```

不再无条件注入所有 `default-plugins/*`，而是读取 `plugins.json` 的启用状态。

当前工作区路径仍然必须始终注入，因为它承载工作区级 `skills/`、`commands/`、未来 `agents/` 等私有能力。这也是单体 Skill 轨道进入 SDK runtime 的主要方式。

### 优先级

能力冲突时建议使用以下优先级：

```text
当前工作区私有能力与单体 Skill > 用户安装插件 > 内置插件 > Proma 内置动态能力
```

对于无法自动解决的冲突，应在 UI 中展示，并尽量避免静默覆盖。

## skills 设计

插件中的 `skills/` 随插件启用后全局可用，由 SDK local plugin 机制加载。

Proma 必须保留单体 Skill 安装轨道：

- `apps/electron/default-skills/` 继续作为默认 Skill 模板来源，按 semver 同步。
- Agent 设置页 Skills 继续管理当前工作区 `skills/`。
- 华泰 SkillHub 继续安装单体 Skill 到当前工作区。
- 标准 Skills CLI 继续可用；若 CLI 安装到外部目录，需要移动/复制到当前工作区 `skills/` 才会被 WorkMate 加载。
- 用户可以手动创建项目级 Skill。
- 用户可以从某个插件中“提取 Skill 到当前工作区”，形成可编辑副本。
- 提取后的 Skill 不再依赖插件启用状态。

UI 操作建议：

- `启用插件`：整个插件生效。
- `安装 Skill`：单体 Skill 进入当前工作区 `skills/`，不改变插件启用状态。
- `提取 Skill`：将插件中的单个 Skill 复制到当前工作区 `skills/`，方便定制。

`default-skills/` 和 `default-plugins/` 保持共存，不做合并迁移。

## commands 设计

当前 `agent-slash-command-service.ts` 已支持扫描当前工作区 `commands/` 和 `default-plugins/*/commands/`。需要改为扫描：

```text
当前工作区 commands/
全局启用用户插件 commands/
全局启用内置插件 commands/
```

命令展示中必须包含来源：

```text
/story-create    dpmp-assist
/brainstorming   superpowers
/release         当前工作区
```

冲突处理：

1. 工作区命令优先。
2. 用户插件优先于内置插件。
3. 多个启用插件存在同名命令时，在 UI 标记冲突。
4. 首版允许冲突存在，但 Discover / Installed / Capabilities 页要展示风险。

## agents 设计

插件里的 `agents/*.md` 应作为子代理定义来源。

Proma 当前有 `buildBuiltinAgents()`，后续应形成统一合并：

```text
Proma 内置 agents
+ 启用插件 agents
+ 当前工作区 agents
```

如果 SDK local plugin 已能原生加载 agents，Proma 可只做索引和 UI 展示；如果 SDK 需要手动传 `options.agents`，则需要解析 agent markdown/frontmatter 后合并。

实施前必须验证当前 `@anthropic-ai/claude-agent-sdk` 版本是否原生读取 local plugin 的 `agents/` 目录：

- 若 SDK 原生支持，Proma 不重复传入插件 agents，只在 capability summary 中展示来源和冲突。
- 若 SDK 不支持，新增 `plugin-agent-service.ts` 解析 markdown 并合并到 `options.agents`。

手动解析模式下，`agents/*.md` 建议采用 frontmatter：

```markdown
---
name: code-reviewer
description: 代码审查子代理
tools:
  - Read
  - Glob
  - Grep
  - Bash
model: haiku
---
你是一个专注于代码质量的审查员……
```

合并位置在 `agent-orchestrator.ts` 构建 SDK options 时，把当前 `agents: buildBuiltinAgents(claudeAvailable)` 改为：

```ts
agents: buildEffectiveAgents({
  workspaceSlug,
  enabledPlugins,
  claudeAvailable,
})
```

同名冲突建议：

```text
工作区 agent > 用户插件 agent > 内置插件 agent > Proma 内置 agent
```

UI 中应显示：

- agent 名称
- 描述
- 来源插件
- 可用工具
- 是否覆盖了同名 agent

## mcpServers 设计

插件 MCP 随插件一起启用。也就是说，插件启用后，插件目录中的 MCP 配置会进入该 Agent 会话的可用能力；插件禁用后，其 MCP 也随之禁用。MCP 不再做独立启用开关。

MCP 仍然是高风险能力，可能涉及命令执行、网络连接、凭据和本地文件访问，因此 Proma 必须在安装、启用和能力页中展示安全信息，并支持 env 配置、连接测试和错误状态展示。

来源包括：

- 插件根目录 `.mcp.json`
- 当前工作区 `mcp.json`
- Proma 动态注入的内置 MCP

首版不从 `.claude-plugin/plugin.json` 读取 `mcpServers`，因为现有插件 manifest 只承载 metadata。后续如引入声明式 manifest v2，再增加兼容读取。

建议最终运行时 MCP 合并顺序：

```text
启用的插件 MCP
+ 当前工作区 mcp.json
+ Proma 动态 MCP
```

同名 MCP 建议命名空间化：

```text
dpmp-assist:drawio
dpmp-assist:chrome-devtools
```

命名空间只用于 Proma 配置、UI 展示和冲突定位。传给 SDK 前需要转换为 SDK 可接受的 server key：

- 如果 SDK 支持冒号 server key，则可直接传 `dpmp-assist:drawio`。
- 如果 SDK 不支持冒号或部分 MCP 工具依赖原始 server name，则运行时使用安全的派生名，例如 `dpmp-assist__drawio`，并在 registry 中保留 `sourcePluginId`、`originalName`、`runtimeName` 映射。
- 工作区 `mcp.json` 保持用户原始名称，不强制 namespace。

插件 MCP 规则：

- 插件启用后，插件 MCP 随插件一起启用。
- 插件禁用后，插件 MCP 随插件一起禁用。
- stdio MCP 在插件安装详情和启用确认中展示 command、args、env。
- 缺少 env/token 时标记“待配置”。
- 用户配置的 env 写入 `plugins.json.mcpServers`。
- 工作区 `mcp.json` 可以覆盖同名或同功能 MCP。
- 如果缺少必填 env，插件仍可启用，但该 MCP 标记为不可用，并在运行时不注入或由 SDK 返回错误状态；具体策略取决于 SDK 对 plugin MCP env 的支持，需要在阶段 0 验证。

UI 应对 MCP 展示安全信息：

- 传输类型：stdio / http / sse
- 命令和参数
- 所需环境变量
- 来源插件
- 当前启用状态
- 最近一次测试结果

## 插件市场安装流程

1. 用户在 `Marketplaces` 页添加市场 URL 或本地目录。
2. Proma 解析 marketplace manifest。
3. `Discover` 页展示插件列表。
4. 用户打开插件详情，查看 metadata、skills、commands、agents、mcpServers。
5. 用户点击安装。
6. Proma 下载插件到临时目录。
7. 校验 manifest、路径安全和必要文件。
8. 原子移动到 `~/.proma/user-plugins/{marketplaceId}/{pluginName}`。
9. 写入 `plugins.json`，默认可启用或安装后询问是否启用。
10. 刷新插件注册表和 UI 能力摘要。

跨文件系统时 `renameSync` 可能失败，安装器必须提供兜底：

1. 优先 `renameSync(tempDir, targetDir)`。
2. 如果失败且错误为跨设备移动，执行 `cpSync(tempDir, targetDir, { recursive: true })`。
3. 校验目标目录完整后 `rmSync(tempDir, { recursive: true, force: true })`。
4. 任一步失败都删除目标半成品目录并保留原版本。

## 安全与校验

必须实现以下校验：

- 禁止绝对路径、`..`、空路径、隐藏路径穿越。
- 下载或复制内容先进入临时目录，全部成功后再原子替换。
- 原子替换需处理跨文件系统 fallback，避免 `rename` 失败导致安装中断。
- 卸载插件只删除 `~/.proma/user-plugins/` 下的目标目录。
- 不执行插件中的脚本。
- 覆盖更新前确认版本和来源。
- 插件启用前展示插件 MCP 的命令、参数和环境变量。
- env/token 不写入插件目录，只写入 Proma 配置。
- 安装失败不得留下半成品目录。

## UI 方案

设置页新增一级 `插件`，需要接入现有设置导航：

- `apps/electron/src/renderer/atoms/settings-tab.ts` 的 `SettingsTab` 增加 `'plugins'`。
- `apps/electron/src/renderer/components/settings/settings-tabs.tsx` 增加插件设置入口，建议仅在 Agent 模式显示，或在 Chat/Agent 都显示但标记为 Agent 扩展。
- `SettingsPanel.tsx` 的 `renderTabContent()` 增加 `PluginSettings`。
- `PluginSettings` 内部再使用本页自己的二级 Tab。

插件页内部建议使用以下 Tab：

```text
插件
├── Discover        # 浏览市场插件
├── Installed       # 已安装插件，启用/禁用/更新/卸载
├── Capabilities    # 当前最终能力：skills/commands/agents/mcpServers
├── Marketplaces    # 添加、删除、刷新市场
└── Errors          # 拉取、解析、冲突、MCP 配置错误
```

### Discover

能力：

- 跨市场搜索插件。
- 按分类、关键词、来源过滤。
- 展示安装状态、版本、更新时间。
- 插件详情中展示完整能力清单。

### Installed

能力：

- 全局启用/禁用插件。
- 更新插件。
- 卸载用户安装插件。
- 内置插件不可卸载，只能启用/禁用。
- 打开插件本地目录。

### Capabilities

展示当前 Agent 最终可用能力：

- Skills
- Commands
- Agents
- MCP Servers

每条能力都展示来源：

```text
当前工作区
builtin:dpmp-assist
user:karpathy-skills/andrej-karpathy-skills
```

### Marketplaces

能力：

- 添加市场。
- 启用/禁用市场。
- 刷新市场。
- 删除市场。
- 展示市场错误。

### Errors

展示：

- manifest 不合法。
- 插件下载失败。
- 路径校验失败。
- command/agent/mcp 冲突。
- MCP env 缺失。

## IPC 与服务划分

建议新增服务：

```text
apps/electron/src/main/lib/plugin-registry-service.ts
apps/electron/src/main/lib/plugin-marketplace-service.ts
apps/electron/src/main/lib/plugin-installer-service.ts
apps/electron/src/main/lib/plugin-capability-service.ts
apps/electron/src/main/lib/plugin-agent-service.ts
```

建议新增 IPC：

```text
PLUGIN_LIST_MARKETPLACES
PLUGIN_ADD_MARKETPLACE
PLUGIN_UPDATE_MARKETPLACE
PLUGIN_REMOVE_MARKETPLACE
PLUGIN_REFRESH_MARKETPLACE

PLUGIN_SEARCH_DISCOVER
PLUGIN_GET_DISCOVER_DETAIL

PLUGIN_LIST_INSTALLED
PLUGIN_ENABLE
PLUGIN_DISABLE
PLUGIN_UNINSTALL
PLUGIN_UPDATE

PLUGIN_LIST_CAPABILITIES
PLUGIN_CONFIGURE_MCP_ENV
PLUGIN_TEST_MCP
```

共享类型应放在 `packages/shared/src/types/agent.ts` 或新增 `packages/shared/src/types/plugin.ts`。

单体 Skill 轨道继续使用现有 IPC：

- `GET_HT_SKILLHUB_SKILLS`
- `READ_HT_SKILLHUB_SKILL`
- `INSTALL_HT_SKILLHUB_SKILL`
- 工作区 Skill CRUD 相关 IPC

插件 IPC 不应复用 SkillHub IPC，避免两条安装轨道语义混淆。

## 默认内容升级策略

当前默认内容分发有两套机制：

| 内容 | 源目录 | 运行时副本 | 当前策略 | 目标策略 |
| --- | --- | --- | --- | --- |
| 默认 Skills | `apps/electron/default-skills/` | `~/.proma/default-skills/` | `SKILL.md` semver 比较 | 保持不变 |
| 内置 Plugins | `apps/electron/bundled-plugins/` | `~/.proma/default-plugins/` | 启动时无条件覆盖 | 改为 plugin version semver 比较 |

内置插件升级策略应与默认 Skill 对齐：

- 读取 `.claude-plugin/plugin.json` 的 `version`。
- 目标不存在时复制。
- bundled version 大于本地 version 时替换。
- bundled version 不大于本地 version 时不覆盖。
- 用户启用状态、插件 MCP env、错误状态只保存在 `plugins.json`，不写入插件目录。
- 如果本地内置插件目录损坏或缺少 manifest，允许重新复制 bundled 版本，并记录 warn。

这样可以避免用户或后续配置流程写入插件目录时被每次启动重置。

## 与现有华泰 SkillHub 的关系

当前 `skillhub-service.ts` 是单体 Skill 市场，不是完整插件市场。

双轨策略：

1. 华泰 SkillHub 长期保留为单体 Skill 安装入口。
2. 插件市场独立支持完整 Plugin 安装，不替代华泰 SkillHub。
3. 如果未来需要统一 UI，可在插件页或能力页展示“Skill 市场”分区，但底层仍调用 `skillhub-service.ts`。
4. `HtSkillHub*` 类型和 IPC 不需要为了插件市场而删除；只有当华泰 SkillHub 协议升级为完整插件市场协议时，才考虑抽象成通用 marketplace source。

## 实施阶段

### 阶段 1：插件注册表

- 扫描 `default-plugins/` 和 `user-plugins/`。
- 解析 `.claude-plugin/plugin.json` metadata、`commands/`、`agents/`、`skills/`、`.mcp.json`。
- 产出统一 capability summary。
- 新增 `plugins.json` 的读写。
- 保持 `default-skills/` 与现有 SkillHub 服务不变，只在 capability summary 中把工作区 Skill 作为另一类来源展示。

### 阶段 2：全局启用状态与运行时注入

- `getBuiltinPluginPaths()` 改为读取内置插件启用状态。
- `getAgentPluginPaths(workspaceSlug)` 改为组合当前工作区路径、启用内置插件、启用用户插件。
- 内置插件默认启用，但可在 UI 禁用。
- 用户插件安装后可启用/禁用。
- Slash command suggestion 从“workspace + 所有 builtin”改为“workspace + 启用 builtin + 启用 user”。

### 阶段 3：插件 MCP 配置

- 解析插件 MCP。
- UI 展示插件 MCP。
- MCP 随插件启用/禁用，不提供独立 MCP 启用开关。
- 支持 env 配置、连接测试。
- Agent 运行时合并插件 MCP 与工作区 MCP。
- 实现 Proma 配置 namespace 到 SDK runtime server key 的映射。

### 阶段 4：插件市场

- 支持添加 GitHub/raw/local 市场。
- 支持发现、安装、更新、卸载插件。
- 安装到 `~/.proma/user-plugins/`。
- 下载失败和解析失败进入 Errors。

### 阶段 5：能力详情与冲突处理

- Capabilities 页展示最终能力。
- 标记 command、agent、mcp 同名冲突。
- 支持从插件提取 Skill 到当前工作区。
- 在 Capabilities 页同时展示单体 Skill 来源和插件 Skill 来源。

### 阶段 6：单体 Skill 与插件市场 UI 收口

- 保留 Agent 设置页现有 Skills 与华泰 SkillHub。
- 插件页只管理完整 Plugin。
- 如果需要统一入口，在插件页增加“Skill 市场入口”快捷链接到现有华泰 SkillHub，而不是复用插件安装流程。

## 测试策略

### 单元测试

- manifest 解析。
- GitHub URL 到 raw manifest 的解析。
- 路径安全校验。
- 插件安装原子替换。
- 跨文件系统安装 fallback。
- 启用状态合并。
- capability summary 扫描。
- command/agent/mcp 冲突检测。
- 内置插件 semver 升级策略。
- 单体 Skill 与插件来源在 capability summary 中同时存在且互不覆盖。

### 集成测试

- 安装示例插件后，Agent SDK options 中包含正确 plugin path。
- 禁用插件后，plugin path 不再注入。
- 插件 command 出现在 slash suggestion。
- 插件 MCP 随插件启用；缺 env 时标记为待配置或运行时不可用，配置 env 后可用。
- 工作区私有 command 优先于插件 command。
- 禁用内置插件后，`getBuiltinPluginPaths()` 和 slash command suggestion 都不再包含该插件。
- 华泰 SkillHub 安装的单体 Skill 仍进入当前工作区 `skills/`，不写入 `plugins.json`。

### UI 测试

- 添加市场。
- 刷新市场。
- 安装插件。
- 启用/禁用插件。
- 查看插件详情。
- 配置插件 MCP。
- 查看 Errors。
- 现有 Skills / 华泰 SkillHub 页面仍可独立安装单体 Skill。

## 关键决策

1. 单体 Skill 安装和完整 Plugin 安装是长期共存的双轨机制。
2. 单体 Skill 安装到当前工作区 `skills/`，不写入 `plugins.json`。
3. 插件启用是全局的，不与工作区绑定。
4. 插件安装到 `~/.proma/user-plugins/`，不是安装到工作区。
5. 工作区私有能力继续保留，只作为当前工作区补充。
6. SDK 运行时以当前工作区 local plugin path + 启用插件 local plugin path 注入为核心。
7. Proma 自己维护插件注册表，用于 UI 展示、冲突检测和 MCP 安全配置。
8. 插件 MCP 随插件启用/禁用，但必须在安装、启用和详情页展示安全信息，并支持 env 配置与测试。
9. 华泰 SkillHub 继续作为单体 Skill 市场，不被插件市场替代。
10. `default-skills/` 和 `default-plugins/` 保持共存，分别按各自 semver 策略升级。
