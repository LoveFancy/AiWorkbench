# 连接器 UI 统一重构 — 设计文档

## 背景

连接器（Connector）在项目中有两条数据路径：

| 路径 | 定义 | 存储 |
|------|------|------|
| 预设连接器（Preset） | WorkMate 内置的飞书 CLI、华泰邮箱等 | `connectors.json`（`source: "preset"`） |
| 自定义连接器（User） | 用户手动添加的 MCP Server | `connectors.json`（`source: "user"`）+ `mcp.json` |

改前这两条路径在 UI 渲染、enabled 状态读写上各自独立，造成：
- 「连应用」Popover 中自定义连接器的 Switch 开关无效
- Agent 技能页中自定义和预置连接器用不同组件渲染（`McpCard` vs `DefaultConnectorCard`），样式不一致
- 自定义连接器的 `displayName` 等元数据未从 `connectors.json` 读取

---

## 设计

### 核心原则

**所有连接器的 enabled 状态和展示元数据统一从 `connectors.json` 读写。**

```
connectors.json  ──┬── enabled 状态（唯一读写入口）
                   ├── displayName / category / description（展示元数据）
                   └── source（preset | user，决定标签和交互路径）
```

### 数据流

```
┌─────────────────────────────────────────────────────┐
│  connectors.json                                     │
│  connectors: {                                       │
│    "feishu-cli": { source:"preset", enabled, ... }   │
│    "huatai-email": { source:"preset", enabled, ... } │
│    "my-server":    { source:"user",   enabled, ... } │
│  }                                                   │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
  getPresetConnectorDefinitions()  →  预处理连接器  source="preset"
  getAllConnectorDefinitions()     →  所有连接器    source="preset"|"user"
           │
           ├──→ AgentConnectorPicker（"连应用" Popover）
           │      ├─ 展示：displayName 从 connectorsConfig 读
           │      └─ 切换：saveConnectorsConfig(connectorId, enabled)
           │
           └──→ AgentSkillsView（Agent 技能页 — 连接器 Tab）
                  ├─ 展示：ConnectorCard 统一渲染
                  │    └─ source=preset → "WorkMate 内置" 标签
                  │    └─ source=user   → category 标签
                  ├─ 切换：预置 → saveConnectorsConfig
                  │        自定义 → data.toggleMcp（保持向后兼容）
                  └─ 详情：预置 → 专用弹窗（飞书 CLI / 华泰邮箱）
                           自定义 → MCP 编辑 Sheet
```

---

## 文件变更

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `default-connectors.ts` | 新增 | `PresetConnectorDefinition` 增加 `source` 字段；新增 `getAllConnectorDefinitions()` 统合预置+自定义 |
| `AgentSkillsView.tsx` | 重构 | 删除 `McpTab` 中间层组件及 `McpTabProps` 接口；内联连接器渲染逻辑；`DefaultConnectorCard` → `ConnectorCard` |
| `AgentConnectorPicker.tsx` | 修复 | `handleToggleEnabled` 统一走 `connectorsConfig`；`displayName` 从 `connectorsConfig` 读取 |
| `McpCard.tsx` | 未改动 | 保留文件，当前未引用（连接器 Tab 已统一用 `ConnectorCard`） |

---

## ConnectorCard 组件协议

```typescript
interface ConnectorCardProps {
  connector: PresetConnectorDefinition & { source?: 'preset' | 'user' }
  server: McpServerEntry | null
  isFeishuConnected: boolean
  enabled: boolean
  onOpen: () => void
  onToggle: (enabled: boolean) => void
  onUnbindFeishu: () => void
  unbindingFeishu: boolean
  onRequestDelete?: () => void        // 自定义连接器删除
  isBuiltin?: boolean                 // 内置标记
  lastTestResult?: { success, message } // 连接状态
}
```

### 卡片底部标签规则

| source | 标签 | 样式 |
|--------|------|------|
| `preset` | WorkMate 内置 | 蓝色 ShieldCheck |
| `user` | category | 灰色 muted |
| `coming-soon` | 敬请期待 | 灰色 muted，不可点击 |

---

## 兼容性说明

- 自定义连接器的 enabled 切换在 AgentSkillsView 侧仍通过 `data.toggleMcp` → `saveWorkspaceMcpConfig` 实现，这是为保持 `McpCard` 的向后兼容。后续可统一到 `saveConnectorsConfig`。
- `McpCard.tsx` 文件保留但当前在连接器 Tab 中不再使用，其他引用方可继续使用。
