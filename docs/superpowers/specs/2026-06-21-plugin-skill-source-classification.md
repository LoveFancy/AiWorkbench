# 插件类型与 Skill 来源分类方案

## 背景

当前插件扫描逻辑以插件根目录为单位识别能力：`skills/`、`commands/`、`agents/`、`.mcp.json`、`expert-groups/` 都会被扫描为 capability。问题不在于插件市场或 `user-plugins` 目录下能否区分插件，而在于需要明确每个插件根目录的产品语义。

已确认的产品语义：

- 普通插件中的 Skill、MCP、Command、Agent 可以被用户或普通 WorkMate 会话独立调用。
- 专家团插件携带的 Skill、MCP、Agent 是专家团私有运行资源，只能在专家团召唤时使用。
- 只要普通插件和专家团插件是不同插件根目录，即使它们属于同一个插件市场，或都位于 `user-plugins/` 下，也可以按插件 ID / 插件路径精确区分加载。

示例：

```text
<CONFIG>/user-plugins/{marketplaceId}/normal-tools/
  .claude-plugin/plugin.json
  skills/
  .mcp.json

<CONFIG>/user-plugins/{marketplaceId}/product-expert-team/
  .claude-plugin/plugin.json
  expert-groups/product-expert-team.json
  skills/
  .mcp.json
```

这两个目录会扫描成不同的插件：

```text
user:{marketplaceId}/normal-tools
user:{marketplaceId}/product-expert-team
```

因此分类应以插件根目录为边界，而不是以插件市场为边界。

## 目标

- 建立互斥的插件分类：专家团插件 / 普通插件。
- 给 `SkillMeta` 增加来源标记，明确区分普通插件提供 / 工作区独立 / 跨工作区导入。
- 消除前端和运行时分散的 `capability.type === 'expert-group'` 硬编码过滤。
- 确保专家团插件携带的 Skill/MCP 不进入普通技能列表，也不进入普通 WorkMate 会话 runtime。
- 确保专家团召唤时能显式加载对应专家团插件目录，让其私有 Skill/MCP 在召唤期间可用。

## 非目标

- 不改变 `AgentPluginManifest` 的声明结构。
- 不改变工作区 skills 目录的物理布局。
- 不改变专家团加载和召唤的核心流程。
- 不支持专家团插件中的 Skill/MCP 被普通会话单独调用。

---

## 1. Plugin 分类

### 1.1 新增 `PluginCategory`

```ts
// packages/shared/src/types/agent.ts

/** 插件分类，由插件根目录内的能力计算得出 */
export type PluginCategory = 'expert-group' | 'general'

/** 专家团能力标记常量 */
export const EXPERT_GROUP_CAPABILITY_TYPE = 'expert-group'
```

分类规则：

| 能力组合 | category | 说明 |
|----------|----------|------|
| 存在 `expert-group` | `'expert-group'` | 专家团插件；其携带的 Skill/MCP/Agent 都是专家团私有资源 |
| 不存在 `expert-group` | `'general'` | 普通插件；其能力可独立展示和调用 |

判断函数：

```ts
// packages/shared/src/utils/plugin-utils.ts

/** 根据插件能力列表计算分类 */
export function classifyPlugin(capabilities: AgentPluginCapability[]): PluginCategory {
  return capabilities.some((capability) => capability.type === EXPERT_GROUP_CAPABILITY_TYPE)
    ? 'expert-group'
    : 'general'
}
```

> 不再引入 `mixed`。如果插件根目录包含 `expert-group`，则整个插件都按专家团插件处理。专家团插件携带的普通能力不是独立能力，而是专家团 runtime 私有资源。

### 1.2 在 `AgentPluginInfo` 上增加计算字段

在 `plugin-registry-service.ts` 的 `pluginInfoFromPath()` 中，构建 `AgentPluginInfo` 时计算 `category`：

```ts
export interface AgentPluginInfo {
  // ... 现有字段 ...
  /** 插件分类（由能力组合计算） */
  category: PluginCategory
}
```

注意：`category` 是计算值，不持久化到 `plugins.json`，每次扫描时从 capabilities 推导。

### 1.3 新增统一的过滤辅助函数

```ts
// packages/shared/src/utils/plugin-utils.ts

/** 是否为专家团插件 */
export function isExpertGroupPlugin(plugin: AgentPluginInfo): boolean {
  return plugin.category === 'expert-group'
}

/** 是否为普通插件 */
export function isGeneralPlugin(plugin: AgentPluginInfo): boolean {
  return plugin.category === 'general'
}

/** 是否应在前端"已安装技能"视图中展示 */
export function isVisibleInSkillsView(plugin: AgentPluginInfo): boolean {
  return isGeneralPlugin(plugin)
}

/** 是否应进入普通 WorkMate 会话 runtime */
export function shouldLoadInGeneralRuntime(plugin: AgentPluginInfo): boolean {
  return isGeneralPlugin(plugin)
}

/** 是否应在专家团召唤 runtime 中加载 */
export function shouldLoadInExpertRuntime(plugin: AgentPluginInfo, expertPluginId: string): boolean {
  return plugin.id === expertPluginId && isExpertGroupPlugin(plugin)
}
```

---

## 2. Skill 来源分类

### 2.1 新增 `SkillSourceKind`

```ts
// packages/shared/src/types/agent.ts

export type SkillSourceKind =
  | 'plugin'      // 普通插件提供，可独立调用
  | 'workspace'   // 工作区独立 Skill（用户自己添加或内置默认）
  | 'import'      // 从其他工作区导入（importSource 不为空）
```

### 2.2 扩展 `SkillMeta`

```ts
export interface SkillMeta {
  slug: string
  name: string
  description?: string
  group?: string
  icon?: string
  version?: string
  enabled: boolean

  /** Skill 来源类型 */
  sourceKind: SkillSourceKind

  /** 当 sourceKind === 'plugin' 时，提供该 skill 的插件 ID */
  sourcePluginId?: string

  /** 当 sourceKind === 'plugin' 时，展示用插件名 */
  sourcePluginName?: string

  /** 当 sourceKind === 'import' 时，携带跨工作区导入信息 */
  importSource?: SkillImportSource

  /** 是否有可用更新 */
  hasUpdate?: boolean
}
```

### 2.3 来源赋值规则

| 场景 | sourceKind | sourcePluginId | sourcePluginName | importSource |
|------|------------|----------------|------------------|--------------|
| 普通插件中的每个 skill capability (`type=skill`) | `'plugin'` | 插件 ID | 插件名 / sourceLabel | - |
| 工作区 skills 目录扫描（无 importSource） | `'workspace'` | - | - | - |
| 工作区 skills 目录扫描（有 importSource） | `'import'` | - | - | 有值 |
| 专家团插件携带的 Skill | 不生成 `SkillMeta` | - | - | - |

赋值点：

- `pluginSkillMeta()` (`agent-workspace-manager.ts`)：只接收普通插件 skill，设置 `sourceKind: 'plugin'`、`sourcePluginId`、`sourcePluginName`。
- `scanSkillsInDir()` (`agent-workspace-manager.ts`)：有 `importSource` 设 `'import'`，否则设 `'workspace'`。
- `installSkillZipToWorkspace()` 等直接构造 `SkillMeta` 的路径：补 `sourceKind: 'workspace'`。

### 2.4 合并策略调整

`mergeSkillsBySlug()` 遇到同 slug 时，需要显式实现来源优先级，而不是依赖数组顺序：

```text
plugin > workspace/import
enabled > disabled
```

当前实现是"先出现优先，只有 disabled 被 enabled 替换"。如果保留 `workspaceSkills` 在前、`pluginSkills` 在后的调用顺序，仅靠现有逻辑无法保证普通插件 Skill 覆盖同名工作区 Skill。

---

## 3. Runtime 加载策略

### 3.1 普通 WorkMate 会话

普通会话通过 `getAgentPluginPaths()` / `buildPluginRuntimePaths()` 给 SDK 传 local plugin path。这里必须按插件粒度过滤：

```ts
listInstalledPlugins()
  .filter((plugin) => plugin.enabled)
  .filter((plugin) => plugin.issues.every((issue) => issue.level !== 'error'))
  .filter(shouldLoadInGeneralRuntime)
```

结果：

- 加载普通插件目录。
- 不加载专家团插件目录。
- 专家团插件携带的 Skill/MCP 不会泄漏到普通会话。

### 3.2 专家团召唤

专家团召唤时，根据 `AgentExpertGroupInfo.sourcePluginId` / `sourcePluginPath` 显式加载目标专家团插件目录：

```ts
const expertRuntimePlugin = {
  type: 'local' as const,
  path: expertGroup.sourcePluginPath,
}
```

结果：

- 只在召唤该专家团时加载它所属的专家团插件目录。
- 该插件内携带的 Skill/MCP/Agent 在专家团 runtime 中可用。
- 同一市场下的其他普通插件或其他专家团插件不受影响。

### 3.3 同市场 / 同 user-plugins 下的区分能力

同一个插件市场或 `user-plugins` 只是存储分组，不影响加载区分。插件边界是：

```text
<CONFIG>/user-plugins/{marketplaceId}/{pluginName}/
```

只要 `{pluginName}` 不同，扫描得到的 `plugin.id` 和 `plugin.path` 就不同，可以按 `category` 独立过滤。

---

## 4. 前端适配

### 4.1 `AgentSkillsView` — 已安装技能过滤

```ts
const visiblePlugins = installedPlugins.filter(isVisibleInSkillsView)
```

只展示普通插件。专家团插件不展示在普通已安装技能视图中，应在专家团入口或专家团详情页展示。

### 4.2 `PluginSettings` — 已安装插件列表

- 插件列表可以继续展示所有插件，但应显示分类标签：普通插件 / 专家团插件。
- 能力摘要对专家团插件要表达"专家团资源"，不要暗示其中 Skill/MCP 可独立调用。
- `summarizeCapabilities`、`groupCapabilities` 等逻辑应复用统一的 capability label / category helper。

### 4.3 Skill 来源展示

在 `SkillCard` 或 `SkillDetailSheet` 中展示来源标签：

| sourceKind | 标签 | 样式 |
|-----------|------|------|
| `plugin` | 插件名 | violet chip |
| `workspace` | 本地 | gray chip |
| `import` | 导入自 {workspace} | blue chip |

注意：`sourceKind === 'plugin'` 只表示普通插件提供的可独立调用 Skill，不包括专家团插件携带的私有 Skill。

---

## 5. 受影响的文件

| 文件 | 变更 |
|------|------|
| `packages/shared/src/types/agent.ts` | 新增 `PluginCategory`、`SkillSourceKind`；扩展 `AgentPluginInfo`、`SkillMeta` |
| `packages/shared/src/utils/plugin-utils.ts` | 新增 `classifyPlugin`、`isExpertGroupPlugin`、`isGeneralPlugin`、runtime/视图过滤 helper |
| `packages/shared/src/utils/index.ts` | 导出 `plugin-utils.ts` |
| `apps/electron/src/main/lib/plugin-registry-service.ts` | `pluginInfoFromPath()` 计算 `category`；`buildPluginRuntimePaths()` 改为按 category 过滤 |
| `apps/electron/src/main/lib/agent-workspace-manager.ts` | 普通能力聚合只处理 `category === 'general'` 插件；`SkillMeta` 赋值 `sourceKind` |
| `apps/electron/src/main/lib/agent-expert-group-manager.ts` / orchestrator 相关文件 | 专家团召唤 runtime 显式包含 `sourcePluginPath` |
| `apps/electron/src/renderer/components/agent-skills/AgentSkillsView.tsx` | 用 `isVisibleInSkillsView` 替代手动过滤 |
| `apps/electron/src/renderer/components/settings/PluginSettings.tsx` | 显示插件分类；专家团插件能力摘要避免暗示可独立调用 |
| `agent-workspace-manager.test.ts` | 验证普通插件 Skill 来源、专家团插件 Skill 不进入普通 capabilities、同名合并策略 |
| `plugin-registry-service.test.ts` | 验证 `category` 计算、普通 runtime 排除专家团插件、同市场不同插件可独立过滤 |
| 专家团 runtime 相关测试 | 验证召唤专家团时加载其 `sourcePluginPath` |

---

## 6. 实施顺序

1. 新增 `PluginCategory`、`SkillSourceKind` 类型，扩展 `AgentPluginInfo` / `SkillMeta`。
2. 新增 `plugin-utils.ts` 辅助函数并导出，补单元测试。
3. `plugin-registry-service.ts` 计算 `category`，替换现有 `isExpertGroupPlugin()` capability 判断。
4. 调整 `buildPluginRuntimePaths()`：普通 runtime 只加载普通插件。
5. 调整专家团召唤路径：显式加载目标专家团插件目录。
6. 调整 `agent-workspace-manager.ts`：普通 capabilities 只聚合普通插件 Skill；所有 `SkillMeta` 构造点补 `sourceKind`。
7. 前端组件适配（`AgentSkillsView`、`PluginSettings`、Skill 来源标签）。
8. 补测试并运行 `bun test` + `bun run typecheck`。
