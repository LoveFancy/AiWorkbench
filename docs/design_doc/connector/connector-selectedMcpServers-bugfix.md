# selectedMcpServers 内存状态未同步 Bug 修复

> 日期：2026-06-24
> 状态：待修复

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

## 六、CLI 类型不受影响

CLI 连接器（如飞书 CLI）通过 `additionalSkillDirs` 注入 SDK，走 `connectors.json.enabled` 判断，不经过 `selectedMcpServers` → `buildMcpServers` 链路，无需修改。

---

## 七、改动文件

| 文件 | 改动 |
|------|------|
| `AgentSkillsView.tsx` | 两处 `onSaved` 回调补充 `setSelectedMcpServersMap` |
| `McpDetailSheet.tsx` | `onSaved` 可能需要回传 `connectorId`（可选优化） |
