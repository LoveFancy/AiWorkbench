
# Skill Hub 管理能力设计文档

> 版本：v4.0
> 日期：2026-06-03
> 状态：设计阶段

> ⚠️ **注意**：本文档为早期管理能力概设，部分内容（API 端点、认证方案）与最新实现方案存在差异。当前以 [skillhub-development-design.md](./skillhub-development-design.md) v1.0 为准。本文档保留以提供能力全景和 Skill 管理体系上下文参考。

---

## 一、SkillHub 管理能力全景

### 1.1 能力点总览

| # | 能力点 | 分类 | 实现状态 |
| --- | --- | --- | --- |
| 1 | **展示 Skill 列表** | 列表展示 | ✅ 已实现 |
| 2 | **搜索过滤**（按名称/描述） | 列表展示 | ✅ 已实现 |
| 3 | **状态标识**（已安装/未安装/已启用/已禁用） | 列表展示 | ✅ 已实现（installed + enabled 字段） |
| 4 | **筛选**（全部/已安装/未安装） | 列表展示 | ✅ 已实现 |
| 5 | **预览 Skill 详情**（SKILL.md） | 预览 | ✅ 已实现 |
| 6 | **安装 Skill**（从 Hub 下载到工作区） | 安装 | ✅ 已实现 |
| 7 | **覆盖安装**（已安装时重新安装） | 安装 | ✅ 已实现 |
| 8 | **刷新列表** | 列表展示 | ✅ 已实现 |
| 9 | **打开本地 Skill 目录** | 辅助 | ✅ 已实现 |
| 10 | **删除 Skill**（从工作区移除） | 卸载 | ⚠️ API 已有，前端未在 Hub 面板使用 |
| 11 | **启用/禁用 Skill** | 开关 | ⚠️ API 已有，前端未在 Hub 面板使用 |
| 12 | **卸载 Hub Skill**（从 Hub 安装的 Skill 移除） | 卸载 | ❌ 缺失 |
| 13 | **检查更新**（Hub 上是否有新版本） | 更新 | ❌ 缺失 |
| 14 | **批量安装**（一次安装多个 Skill） | 批量操作 | ❌ 缺失 |
| 15 | **批量卸载**（一次卸载多个 Skill） | 批量操作 | ❌ 缺失 |
| 16 | **认证鉴权**（EIP 登录 + SkillHub 换票） | 认证 | ❌ 待实现 |

### 1.2 分类说明

| 分类 | 包含能力 | 含义 |
| --- | --- | --- |
| **列表展示** | 展示列表、搜索过滤、状态标识、筛选、刷新 | 用户在面板中看到什么 |
| **预览** | 预览 Skill 详情 | 点击 Skill 后看到 SKILL.md 内容 |
| **安装** | 安装、覆盖安装 | 把 Hub 上的 Skill 下载到本地工作区 |
| **开关** | 启用/禁用 | 控制 Agent 是否加载该 Skill |
| **卸载** | 删除、卸载 | 从工作区移除 Skill |
| **更新** | 检查更新 | 判断已安装 Skill 是否有新版本 |
| **批量操作** | 批量安装、批量卸载 | 对多个 Skill 同时操作 |
| **认证** | 认证鉴权 | 用户身份验证，控制访问权限 |

### 1.3 当前能力覆盖度

```
已实现：  9 / 16  (56%)

列表展示 ████████████████████ 100%  (5/5)
预览     ████████████████████ 100%  (1/1)
安装     ████████████████████ 100%  (2/2)
开关     ██████████░░░░░░░░░░  50%  (1/2) ← API 有，前端未接入
卸载     ██████████░░░░░░░░░░  33%  (1/3) ← delete 通用删除有但未用，卸载缺失
更新     ░░░░░░░░░░░░░░░░░░░░   0%  (0/1)
批量操作 ░░░░░░░░░░░░░░░░░░░░   0%  (0/2)
认证     ░░░░░░░░░░░░░░░░░░░░   0%  (0/1)
```

---

## 二、背景

Proma 已对接华泰内部 SkillHub（`http://skillhub.uat.saas.htsc/.well-known/skills`），前端在 `AgentSettings.tsx` 内嵌了一个 `HtSkillHubPanel` 组件。

为形成完整的远程 Skill 生命周期管理闭环，需要补齐开关、卸载、更新检测、批量操作、认证鉴权等能力。

---

## 三、现有 Skill 管理体系全貌

### 2.1 三层目录结构

```
~/.proma/
├── default-skills/                    ← 1️⃣ 内置默认 Skill（应用自带，14个）
│   ├── brainstorming/
│   ├── docx/
│   ├── pptx/
│   ├── pdf/
│   ├── xlsx/
│   ├── drawio/
│   ├── guizang-ppt-skill/
│   ├── executing-plans/
│   ├── writing-plans/
│   ├── skill-creator/
│   ├── tool-builder/
│   ├── find-skills/
│   ├── proma-coach/
│   ├── web-search/
│   └── install-python/
│
├── agent-workspaces.json              ← 工作区索引
│
└── agent-workspaces/
    └── {workspace-slug}/              ← 2️⃣ 工作区
        ├── .claude-plugin/
        │   └── plugin.json            ← SDK 需要此文件发现 skill
        ├── mcp.json
        ├── workspace-files/
        ├── skills/                    ← 3️⃣ 已启用 Skill（Agent 只加载这里的）
        │   ├── code-review/
        │   │   ├── SKILL.md           ← 核心：Agent 通过此文件理解 Skill
        │   │   └── scripts/...
        │   └── my-skill/
        │       └── SKILL.md
        └── skills-inactive/           ← 已禁用 Skill（Agent 不加载）
            └── old-skill/
                └── SKILL.md
```

### 2.2 Skill 的三大来源

```
来源                  流向                             管理模块
──────────────────────────────────────────────────────────────────
① 内置默认 Skill       应用启动时 → 自动复制 default-skills/      upgradeDefaultSkillsInWorkspaces()
       ↓               → 每个工作区 skills/
② SkillHub 安装        用户操作 → fetch 下载 → atomic 写入         skillhub-service.ts
       ↓               → 写入 skills/{name}/
③ 跨工作区导入          用户操作 → cpSync 复制目录                  importSkillFromWorkspace()
       ↓               → 写入 skills/{slug}/
```

### 2.3 启用/禁用的本质：目录搬家

```
启用：  mv skills-inactive/xxx/ → skills/xxx/
禁用：  mv skills/xxx/          → skills-inactive/xxx/

实现函数：toggleWorkspaceSkill(workspaceSlug, skillSlug, enabled)
        核心一行：renameSync(srcPath, destPath)
```

### 2.4 版本化自升级（`upgradeDefaultSkillsInWorkspaces`）

应用每次启动时自动执行：

```
1. 扫描 default-skills/ → 收集每个 Skill 的 version（从 SKILL.md frontmatter 读取）
2. 遍历所有工作区
   ├── skills/{name}/ 存在 + bundled version > 本地 version → safeReplaceSkillDir（先删后拷）
   ├── skills-inactive/{name}/ 存在 + bundled version > 本地 version → 同上（保持 disabled 状态）
   └── 都不存在 → cpSync 到 skills/（新 Skill 自动启用）
3. safeReplaceSkillDir：
   ├── rmSync(targetPath, { recursive: true, force: true })
   └── cpSync(sourcePath, targetPath, { recursive: true, filter: skillCopyFilter })
        └── 过滤规则：跳过 .git / node_modules / dist / .next / .cache / .turbo / __pycache__
```

### 2.5 Skill 元数据解析（`parseSkillFrontmatter`）

读取 `SKILL.md` 的 YAML frontmatter（自研轻量解析器，不依赖 YAML 库）：

```markdown
---
name: 代码审查助手
description: 自动审查代码质量
version: 1.2.0
icon: 🔍
---

# 代码审查助手
...
```

- 支持单行值、block scalar（`|` / `>`）、多行缩进
- 提取 `name / description / version / icon` 四个字段
- 返回 `SkillMeta { slug, name, description?, version?, enabled }`

### 2.6 17 个导出函数全览

| 分类 | 函数 | 操作 |
| --- | --- | --- |
| **扫描** | `getWorkspaceSkills(slug)` | 扫描 `skills/` → SkillMeta[]（仅 active） |
| | `getAllWorkspaceSkills(slug)` | 扫描 `skills/` + `skills-inactive/` → SkillMeta[] |
| | `getOtherWorkspaceSkills(slug)` | 列出其他工作区 Skill（导入对话框用） |
| **增删** | `deleteWorkspaceSkill(slug, name)` | `rm -rf skills/{name}` |
| | `createSkillEntry(slug, name)` | 新建 Skill 目录 + 写入初始 SKILL.md |
| | `deleteSkillEntry(slug, name, path)` | 删除 Skill 内子文件 |
| | `renameSkillEntry(slug, name, old, new)` | 重命名 Skill 内子文件 |
| **开关** | `toggleWorkspaceSkill(slug, name, enabled)` | `mv skills/ ↔ skills-inactive/` |
| **导入导出** | `importSkillFromWorkspace(target, source, name)` | `cpSync` + 标记 importSource |
| | `updateSkillFromSource(target, name)` | 从来源工作区同步最新版本 |
| **版本升级** | `upgradeDefaultSkillsInWorkspaces()` | 启动时自动升级 14 个内置 Skill |
| **文件操作** | `listSkillFiles(slug, name)` | 列出 Skill 目录下的文件树 |
| | `readSkillFile(slug, name, path)` | 读 Skill 内子文件 |
| | `writeSkillFile(slug, name, path, content)` | 写 Skill 内子文件 |
| | `readWorkspaceSkillContent(slug, name)` | 读 SKILL.md 内容 |
| | `writeWorkspaceSkillContent(slug, name, content)` | 写 SKILL.md 内容 |
| **辅助** | `ensurePluginManifest(slug, name)` | 创建 `.claude-plugin/plugin.json` |

---

## 四、Agent 加载 Skill 的机制

### 3.1 只加载 `skills/` 目录

是的，Agent 启动时**只加载 `skills/` 目录**，`skills-inactive/` 内的 Skill 不会被加载。

### 3.2 加载链路

```
agent-orchestrator.ts  sendMessage()
    │
    ├── getAgentPluginPaths(workspaceSlug)           ← 行266
    │       ├── 有 workspaceSlug：
    │       │     [{ type: 'local', path: '~/.proma/agent-workspaces/{slug}/' }]
    │       └── 无 workspaceSlug：空数组
    │
    ├── 传入 SDK queryOptions.plugins                   ← 行1484
    │       sdk.query({ ...options, plugins })
    │
    ▼
Claude Agent SDK（@anthropic-ai/claude-agent-sdk）
    │
    ├── SDK 扫描 plugin.path 目录
    ├── 查找 .claude-plugin/plugin.json（ensurePluginManifest 已创建）
    ├── 从 plugin.json 定位 skills 目录
    └── 递归扫描 skills/ 下的每个子目录
          │
          ├── 子目录/key-code-review/
          │   └── SKILL.md  ← Agent 读取此文件理解 Skill 的定义
          ├── 子目录/my-skill/
          │   └── SKILL.md
          └── ...
```

### 3.3 核心代码位置

```typescript
// agent-orchestrator.ts 行266
function getAgentPluginPaths(workspaceSlug?: string): Array<{ type: 'local'; path: string }> {
  return [
    ...(workspaceSlug ? [{ type: 'local' as const, path: getAgentWorkspacePath(workspaceSlug) }] : []),
    ...buildPluginRuntimePaths(),  // 全局已启用插件
  ]
}

// agent-orchestrator.ts 行1484
const plugins = getAgentPluginPaths(workspaceSlug)
return plugins.length > 0 ? { plugins } : {}

// 作为 sdk.query() 的 options 传入
```

### 3.4 `ensurePluginManifest` 的作用

Claude Agent SDK 需要 `.claude-plugin/plugin.json` 文件来发现工作区中的 Skill。如果没有这个文件，SDK 找不到 Skill，即使 `skills/` 目录下有内容也不会被加载。

```typescript
// agent-workspace-manager.ts
export function ensurePluginManifest(workspaceSlug: string, workspaceName: string): void {
  // 检查 ~/.proma/agent-workspaces/{slug}/.claude-plugin/plugin.json
  // 不存在则创建：
  { "name": "proma-workspace-{slug}", "version": "1.0.0" }
}
```

### 3.5 系统提示词中的 Skill 上下文

Agent 也会通过系统提示词知道自己有哪些 Skill：

```
agent-prompt-builder.ts → buildSystemPrompt()
    ↓
通过 getWorkspaceSkills() / getWorkspaceMcpConfig() 获取当前工作区的能力
    ↓
注入到 prompt 中：
  Skills 目录: ~/.proma/agent-workspaces/{slug}/skills/
  MCP 配置: ~/.proma/agent-workspaces/{slug}/mcp.json
```

系统提示词会告诉 Agent "Skills 目录在哪"，但 Skill 的实际工具注册由 SDK 通过 `.claude-plugin/plugin.json` 完成。

### 3.6 关键结论

```
① Agent 只加载 skills/ 目录，skills-inactive/ 完全不可见
② 加载通过 Claude Agent SDK 的 plugin 系统 → SDK 扫描 .claude-plugin/plugin.json
③ ensurePluginManifest() 确保每个工作区有此文件（无则自动创建）
④ 提示词告诉你"Skills 在哪"，但加载靠的是 SDK 的目录扫描
⑤ 全局插件也通过 buildPluginRuntimePaths() 一同注入
```

---

## 五、已具备的后端能力

| 能力 | 代码位置 | IPC 通道 | 状态 |
| --- | --- | --- | --- |
| 获取 SkillHub 索引 | `skillhub-service.ts:fetchHtSkillHubIndex()` | `GET_HT_SKILLHUB_SKILLS` | ✅ 已有 |
| 读取远端 SKILL.md | `skillhub-service.ts:readHtSkillHubSkillContent()` | `READ_HT_SKILLHUB_SKILL` | ✅ 已有 |
| 安装到工作区 | `skillhub-service.ts:installHtSkillHubSkill()` | `INSTALL_HT_SKILLHUB_SKILL` | ✅ 已有 |
| 删除工作区 Skill | `agent-workspace-manager.ts:deleteWorkspaceSkill()` | `agent:delete-workspace-skill` | ✅ 已有 |
| 启用/禁用 Skill | `agent-workspace-manager.ts:toggleWorkspaceSkill()` | `agent:toggle-workspace-skill` | ✅ 已有 |
| 列出工作区所有 Skill | `agent-workspace-manager.ts:getAllWorkspaceSkills()` | 无独立 IPC（内嵌于工作区能力查询） | ✅ 已有 |
| 从其他工作区导入 Skill | `agent-workspace-manager.ts:importSkillFromWorkspace()` | 有 IPC 通道 | ✅ 已有 |

---

## 六、已具备的前端能力（`AgentSettings.tsx` → `HtSkillHubPanel`）

| 能力 | 说明 |
| --- | --- |
| Skill 列表 | 调用 `window.electronAPI.getHtSkillHubSkills()` 获取 |
| 搜索过滤 | 输入框实时过滤（all / installed / uninstalled 三种筛选） |
| 预览 SKILL.md | 点击 Skill → 右侧面板渲染 Markdown |
| 安装 | 点击"安装" → `installHtSkillHubSkill()` → Toast |
| 覆盖安装 | 已安装时弹出 confirm → 覆盖 |
| 刷新列表 | 顶栏刷新按钮 |
| 打开本地目录 | `openInstalledFolder()` |

---

## 七、真正缺失的能力

1. **卸载 Hub Skill** — 缺少"卸载"语义和确认交互（底层 `deleteWorkspaceSkill` 已有）
2. **更新检测** — 无法判断已安装 Skill 在 Hub 上是否有新版本
3. **独立管理面板** — 当前混在 `AgentSettings.tsx` 的 Settings tab 中
4. **批量操作** — 不支持批量安装/卸载/启用/禁用
5. **启用/禁用 UI** — IPC 已有（`toggleWorkspaceSkill`），前端未使用
6. **来源标记** — SkillHub 安装后不记录来源，无法区分"Hub 安装的"和"用户自建的"
   - 当前：跨工作区导入的 Skill 有 `importSource` 标记（`agent-workspace-manager.ts`），但 Hub 安装的没有
   - 影响：删除时无法判断是否应该阻止删除非 Hub 来源的 Skill；卸载时无法精确卸载"仅 Hub 来源"的

---

## 八、数据模型

### 7.1 现有类型（`@proma/shared` `agent.ts`）

```typescript
export interface HtSkillHubSkill {
  name: string; description: string; files: string[]
  installed: boolean; enabled?: boolean
}
export interface HtSkillHubInstallResult {
  skillName: string; status: 'installed' | 'overwritten'; enabled: boolean
}
export interface SkillMeta {
  slug: string; name: string; description?: string
  version?: string; enabled: boolean
  importSource?: SkillImportSource; hasUpdate?: boolean
}
```

### 7.2 需新增的类型

```typescript
export interface SkillUpdateInfo {
  skillName: string; currentVersion?: string; latestVersion?: string; hasUpdate: boolean
}
export interface BatchSkillOperationInput {
  workspaceSlug: string; skillNames: string[]; overwrite?: boolean
}

/** SkillHub 安装来源标记（写入 SKILL.md frontmatter 或 package.json） */
export interface SkillHubSource {
  type: 'skillhub'
  skillName: string          // Hub 上的原始名称
  installedAt: string        // ISO 8601
  installedVersion?: string  // 安装时 Hub 上的版本
}
```

### 7.3 来源标记方案

**安装时自动写入 `.proma-source.json`**（与跨工作区导入的 `importSource` 机制对齐，但物理存储方式更简单）：

```
skills/{name}/
├── SKILL.md
├── scripts/...
└── .proma-source.json      ← 安装完成后写入
    {
      "type": "skillhub",
      "skillName": "code-review",
      "installedAt": "2026-06-03T10:00:00Z",
      "installedVersion": "1.2.0"
    }
```

**判断逻辑**：

```typescript
function isFromSkillHub(workspaceSlug: string, skillSlug: string): boolean {
  const sourcePath = join(skillsDir, skillSlug, '.proma-source.json')
  if (!existsSync(sourcePath)) return false
  const source = JSON.parse(readFileSync(sourcePath, 'utf-8'))
  return source.type === 'skillhub'
}
```

有了这个标记后：
- `deleteWorkspaceSkill` 可以改为 `deleteHubSkillOnly`，加上来源校验
- 前端可以区分"本地 Skill"和"Hub Skill"，只对 Hub 来的显示卸载按钮
- 更新检测可以直接读 `.proma-source.json` 中的 `installedVersion` 与远端对比

---

## 九、API 设计

### 8.1 现有通道（保持不变）

```typescript
GET_HT_SKILLHUB_SKILLS       // ✅ 已有 → fetchHtSkillHubIndex()
READ_HT_SKILLHUB_SKILL       // ✅ 已有 → readHtSkillHubSkillContent()
INSTALL_HT_SKILLHUB_SKILL    // ✅ 已有 → installHtSkillHubSkill()
DELETE_WORKSPACE_SKILL       // ✅ 已有 → deleteWorkspaceSkill()
TOGGLE_WORKSPACE_SKILL       // ✅ 已有 → toggleWorkspaceSkill()
```

### 8.2 预新增通道

```typescript
UNINSTALL_HT_SKILLHUB_SKILL       // 卸载（包装 deleteWorkspaceSkill）
CHECK_SKILL_UPDATES               // 更新检测
BATCH_INSTALL_HT_SKILLHUB_SKILLS  // 批量安装
BATCH_UNINSTALL_HT_SKILLHUB_SKILLS // 批量卸载
```

### 8.3 接口契约

| 通道 | 输入 | 输出 | |
| --- | --- | --- | --- |
| `GET_HT_SKILLHUB_SKILLS` | `workspaceSlug` | `HtSkillHubSkill[]` | ✅ |
| `READ_HT_SKILLHUB_SKILL` | `skillName` | `string` | ✅ |
| `INSTALL_HT_SKILLHUB_SKILL` | `{workspaceSlug, skillName, overwrite}` | `HtSkillHubInstallResult` | ✅ |
| `DELETE_WORKSPACE_SKILL` | `{workspaceSlug, skillSlug}` | `void` | ✅ |
| `TOGGLE_WORKSPACE_SKILL` | `{workspaceSlug, skillSlug, enabled}` | `void` | ✅ |
| `UNINSTALL_HT_SKILLHUB_SKILL` | `{workspaceSlug, skillName}` | `void` | 🆕 |
| `CHECK_SKILL_UPDATES` | `workspaceSlug` | `SkillUpdateInfo[]` | 🆕 |
| `BATCH_INSTALL_HT_SKILLHUB_SKILLS` | `BatchSkillOperationInput` | `HtSkillHubInstallResult[]` | 🆕 |
| `BATCH_UNINSTALL_HT_SKILLHUB_SKILLS` | `BatchSkillOperationInput` | `void` | 🆕 |

---

## 十、后端服务设计（新增函数）

### 9.1 卸载 Skill

```typescript
export async function uninstallHtSkillHubSkill(
  workspaceSlug: string, skillName: string
): Promise<void>
// 1. 检查 .proma-source.json 校验来源是否为 skillhub
// 2. 非 skillhub 来源 → 拒绝卸载（抛异常："此 Skill 不是从 SkillHub 安装的"）
// 3. 是 skillhub 来源 → 调用 deleteWorkspaceSkill()
```

### 9.2 检查更新

```typescript
export async function checkSkillUpdates(
  workspaceSlug: string
): Promise<SkillUpdateInfo[]>
// 对比本地 SKILL.md vs 远端 SKILL.md 的 version
```

### 9.3 批量操作

```typescript
export async function batchInstallHtSkillHubSkills(
  input: BatchSkillOperationInput
): Promise<HtSkillHubInstallResult[]>
// 并发上限 3，逐个调用 installHtSkillHubSkill

export async function batchUninstallHtSkillHubSkills(
  input: BatchSkillOperationInput
): Promise<void>
```

---

## 十一、前端 UI 设计

### 10.1 升级策略：最小改动

当前 `HtSkillHubPanel` 已在 `AgentSettings.tsx` 中运行良好，建议**重构而非重写**：

- **保留**：搜索、筛选、列表、预览、安装的核心交互
- **新增**：卸载按钮、启用/禁用开关、"检查更新"按钮
- **可选升级**：提取为独立组件文件、添加批量操作栏

### 10.2 操作行扩展

```
当前： [安装] [打开目录]
                    ↓
全新： [预览] [安装] [卸载] [⏸ 禁用] [🔍 检查更新]

状态         操作行
⬇️ 未安装    [预览] [安装]
✅ 已启用    [预览] [卸载] [禁用]
⏸  已禁用    [预览] [启用] [卸载]
🔄 有更新    [预览] [更新] [卸载]
```

### 10.3 批量操作栏（底部）

```
☐ 全选 (3/10)  [批量安装] [批量卸载] [批量启用] [批量禁用]
```

---

## 十二、实施步骤

### 阶段一：类型定义（`@proma/shared`）
- `agent.ts` → 新增 `SkillUpdateInfo`、`BatchSkillOperationInput`、`SkillHubSource`

### 阶段二：后端服务
- `skillhub-service.ts`
  - `installHtSkillHubSkill()` → 安装完成后写入 `.proma-source.json` 来源标记
  - 新增 `isFromSkillHub()` → 判断 Skill 是否来自 Hub
  - 新增 `uninstallHtSkillHubSkill()` → 带来源校验的卸载（包装 `deleteWorkspaceSkill`）
  - 新增 `checkSkillUpdates()` → 远程版本对比（读 `.proma-source.json` 的 `installedVersion`）
  - 新增 `batchInstallHtSkillHubSkills()` → 批量安装
  - 新增 `batchUninstallHtSkillHubSkills()` → 批量卸载

### 阶段三：IPC 注册
- `ipc.ts` → 注册 4 个新 handler
- `preload/index.ts` → 类型声明 + API 暴露

### 阶段四：前端
- `HtSkillHubPanel` → 新增卸载/启用/禁用/检查更新按钮
- `HtSkillHubPanel` → 新增批量操作栏
- `HtSkillHubPanel` → 提取为独立文件 `SkillHubPanel.tsx`

---

*本文档基于实际代码盘点（commit 历史 + 源码分析），待评审后实施。*
