# selectedMcpServers 内存状态未同步 Bug 修复 + CLI Skill 加载修复

> 日期：2026-06-24（MCP 修复）/ 2026-06-25（CLI Skill 修复）
> 状态：已修复

---

## 一、问题描述

**现象**：用户在 AgentSkillsView 中绑定华泰邮箱或创建自定义 MCP 连接器后，发送 Agent 消息时 MCP 工具未注入 SDK，Agent 提示 `no mcp__huatai-email__* tools`。

**根因**：`selectedMcpServersMap`（会话级原子状态）只在 `AgentConnectorPicker` 中写入，`AgentSkillsView` 的绑定/创建回调未同步更新。

---

## 二、涉及的状态

```
┌────────────────────────────────────────────────────────┐
│                    磁盘层（持久化）                       │
│  connectors.json ── 连接器 enabled/type/source          │
│  mcp.json        ── MCP 运行时配置（command/args/env）   │
└────────────────────────┬───────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  后端 buildMcpServers   CLI Skill 扫描    前端 UI
                          
┌────────────────────────────────────────────────────────┐
│                    内存层（会话级）                       │
│  capabilitiesVersion (atom) ── 触发 UI 重载配置          │
│  selectedMcpServersMap (atom) ── 当前会话 MCP 白名单      │
│  connectorEnabledMap (useState) ── AgentSkillsView UI    │
└────────────────────────────────────────────────────────┘
```

---

## 三、核心链路

```
AgentView.sendMessage()
  → selectedMcpServers = selectedMcpServersMap.get(sessionId) ?? []
  → agent-orchestrator
    → buildMcpServers(workspaceSlug, config, selectedMcpServers)
      → selectedMcpServers = [] → 所有 MCP 都不加载
```

---

## 四、3 个写入入口对比

| 入口 | 文件 | 写 connectors.json | 写 mcp.json | 写 selectedMcpServersMap |
|------|------|:---:|:---:|:---:|
| AgentConnectorPicker.handleToggleEnabled | AgentConnectorPicker.tsx | ✅ | — | ✅ |
| AgentSkillsView 华泰邮箱绑定 onSaved | AgentSkillsView.tsx | ✅ | ✅ | ❌ |
| AgentSkillsView 用户自定义 MCP 创建 onSaved | AgentSkillsView.tsx | ✅ | ✅ | ❌ |

---

## 五、修复方案

在 `AgentSkillsView.tsx` 的两处 `onSaved` 回调中补充 `setSelectedMcpServersMap`：

### 5.1 华泰邮箱绑定完成

```ts
// AgentSkillsView.tsx
import { agentSelectedMcpServersAtom } from '@/atoms/agent-atoms'

const setSelectedMcpServersMap = useSetAtom(agentSelectedMcpServersAtom)

// HuataiEmailConnectorDialog.onSaved
onSaved={() => {
  setActiveDefaultConnector(null)
  void loadConnectorEnabledMap()
  bumpCapabilities((v) => v + 1)
  // + 同步到会话白名单
  setSelectedMcpServersMap((prev) => {
    const map = new Map(prev)
    // 遍历所有 session，追加上 'huatai-email'
    for (const [sid, names] of map) {
      if (!names.includes('huatai-email')) {
        map.set(sid, [...names, 'huatai-email'])
      }
    }
    return map
  })
}}
```

### 5.2 用户自定义 MCP 创建完成

```ts
// AgentSkillsView.tsx McpDetailSheet.onSaved
onSaved={() => {
  setMcpSheetOpen(false)
  bumpCapabilities((v) => v + 1)
  // + 同步新建的 connectorId 到会话白名单
  // connectorId 需要从 McpServerForm 回传
}}
```

> 注：入口 5.2 需要 `McpDetailSheet` 的 `onSaved` 回传 `connectorId`，或者 `AgentSkillsView` 从 `mcpConfig` 中 diff 出新 server。

---

## 六、CLI 类型 Skill 加载修复

### 6.1 问题

CLI 连接器（如飞书 CLI、hi-agent）的 skill 无法被 SDK 加载。根因是 SDK 的 plugin 机制要求插件目录下存在 `.claude-plugin/plugin.json`，而连接器目录（`connectors/{name}/`）只有 `connector.json`。

```
connectors/feishu-cli/
├── connector.json          ← 有
├── skills/
│   └── SKILL.md            ← skill 文件存在但无法被发现
└── .claude-plugin/         ← 缺失！
    └── plugin.json
```

### 6.2 修复

在 `syncDefaultConnectorsToWorkspace()` 中，为每个 CLI 类型连接器自动生成 `.claude-plugin/plugin.json`：

```ts
// agent-workspace-manager.ts — ensureConnectorPluginManifest()
const manifest = {
  name: `connector-${connectorId}`,
   version: '1.0.0',
   description: `WorkMate 预置连接器: ${connectorId}`,
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
```

同时简化 `agent-orchestrator.ts` 的 CLI plugin 扫描逻辑：SDK plugin 机制会自动扫描 `skills/` 子目录，无需手动检查 `skillDirs`。

### 6.3 影响

| 连接器 | skills 目录 | 修复前 | 修复后 |
|--------|------------|:---:|:---:|
| feishu-cli | `skills/` (1 个 SKILL.md) | 不加载 | 自动加载 |
| hi-agent | `skills/talents-cli/` (1 个 SKILL.md) | 不加载 | 自动加载 |

多个 skill 子目录也自动支持，SDK 会扫描 `skills/` 下所有 `SKILL.md`。

---

## 七、改动文件

### MCP 修复

| 文件 | 改动 |
|------|------|
| `AgentSkillsView.tsx` | 两处 `onSaved` 回调补充 `setSelectedMcpServersMap` |
| `McpDetailSheet.tsx` | `onSaved` 可能需要回传 `connectorId`（可选优化） |

### CLI Skill 加载修复

| 文件 | 改动 |
|------|------|
| `agent-workspace-manager.ts` | 新增 `ensureConnectorPluginManifest()`，在 `syncDefaultConnectorsToWorkspace()` 中为 CLI 连接器生成 `.claude-plugin/plugin.json` |
| `agent-orchestrator.ts` | 简化 CLI plugin 扫描逻辑：移除 `readSkillDirsFromConnectorJson` / `skillDirs` 检查，SDK plugin 机制自动扫描 `skills/` 子目录 |
