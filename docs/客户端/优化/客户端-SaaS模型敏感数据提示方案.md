# 客户端 — SaaS 模型敏感数据提示方案

编辑时间：2026年6月23日

---

## 一、背景

客户端区分两类模型：

- **私有化模型**（`local-*`）：模型 ID 以 `local` 标识，数据在内网/本地处理。
- **SaaS 云端模型**（`saas-*`）：数据经第三方云服务处理，存在数据泄露风险。

目前仅在 Auto Mode 候选模型配置弹窗（[`CandidateModelDialog.tsx`](../../../apps/electron/src/renderer/components/settings/CandidateModelDialog.tsx)）中存在一条 SaaS 安全提示。用户在日常聊天的模型选择下拉（[`ModelSelector.tsx`](../../../apps/electron/src/renderer/components/chat/ModelSelector.tsx)）中**没有**任何提示，选中 SaaS 模型时也**无任何提醒**。

需求文档《自动切换模型可配置化需求》原计划在模型列表顶部放置一条「始终可见」的安全提示条，但实现中未落地到模型选择下拉。本方案补齐这一提示，并新增「每次选择 SaaS 模型时提醒」的交互。

---

## 二、需求目标

在用户接触模型的各处持续、明确地提醒：**敏感数据请勿使用 SaaS 模型**。

1. **模型选择下拉顶部固定提示条**：始终可见，引导优先使用本地模型。
2. **SaaS 模型行标识**：模型列表中 `saas-*` 模型旁显示「云端 (SaaS)」徽标。
3. **选中 SaaS 模型即时提醒**：用户每次选中 SaaS 模型时弹出非阻断 toast 提醒（不打断切换）。
4. **候选配置弹窗文案对齐**：已有 SaaS 提示中补入统一措辞。

---

## 三、设计

### 3.1 SaaS 模型判定

与现有 `local` 判定（`CandidateModelDialog.tsx` 中 `isLocalModel`）对称，新增 helper：

```ts
function isSaasModel(modelId: string): boolean {
  return modelId.toLowerCase().startsWith('saas-')
}
```

放置于 [`ModelSelector.tsx`](../../../apps/electron/src/renderer/components/chat/ModelSelector.tsx) 文件内的 Helpers 区。

### 3.2 模型选择下拉顶部固定提示条

**文件**：`apps/electron/src/renderer/components/chat/ModelSelector.tsx`

在 `PopoverContent` 最顶部（Auto Mode 开关区之上）加入一条始终可见的醒目警告条，复用候选弹窗的琥珀色 + 盾牌图标风格：

```
┌────────────────────────────────────────────────┐
│ 🛡 敏感数据请勿使用 SaaS 模型，建议优先选择本地    │
│    （local）模型。                                │
└────────────────────────────────────────────────┘
```

- **样式**：`bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400`，`Shield` 图标。
- **始终可见**：不随 Auto Mode 开关状态变化，无论是否有 `autoModeConfig` 均展示。

### 3.3 SaaS 模型行标识

**文件**：`apps/electron/src/renderer/components/chat/ModelSelector.tsx`

在模型列表每一行（约 L440 渲染 `option` 处），对 `isSaasModel(option.modelId)` 为真的模型，在模型名旁追加一个小徽标：

```
saas-doubao-15-pro-32k          云端 (SaaS)
local-qwen36-27b
```

- **样式**：琥珀色小标签，与现有「多模态」等标签视觉风格统一。
- **仅 SaaS 模型显示**，本地模型不显示。

### 3.4 选中 SaaS 模型即时 toast 提醒

**文件**：`apps/electron/src/renderer/components/chat/ModelSelector.tsx`

在 `handleSelect(option)` 中，选中模型若为 SaaS，则弹出非阻断 toast（使用 `sonner`），**不阻断**模型切换：

```ts
import { toast } from 'sonner'

const handleSelect = (option: ModelOption): void => {
  if (isSaasModel(option.modelId)) {
    toast.warning('已切换到 SaaS 云端模型', {
      description: '敏感数据请勿使用 SaaS 模型，数据将经第三方云服务处理。',
    })
  }
  // ...原有切换逻辑不变
}
```

- **触发时机**：每次选中 SaaS 模型都触发（用户明确要求，不做「仅首次」去重）。
- **非阻断**：toast 仅提醒，切换照常完成。
- 注意 `handleSelect` 中存在 `onModelSelect` 提前 return 的分支，toast 需放在分支判断之前，保证两条路径都能提醒。

### 3.5 候选配置弹窗文案对齐

**文件**：`apps/electron/src/renderer/components/settings/CandidateModelDialog.tsx`

现有顶部提示与 SaaS 二次确认弹窗的文案中，统一加入「敏感数据请勿使用 SaaS 模型」措辞，与下拉提示条保持一致。仅文案调整，无逻辑变更。

---

## 四、改动清单

| 文件 | 改动 |
|------|------|
| `apps/electron/src/renderer/components/chat/ModelSelector.tsx` | 新增 `isSaasModel`；顶部固定警告条；SaaS 行徽标；`handleSelect` 中加非阻断 toast |
| `apps/electron/src/renderer/components/settings/CandidateModelDialog.tsx` | 提示文案对齐 |

- 无新增组件、无状态/存储改动、无后端接口依赖。

---

## 五、非功能与验证

- **不阻断主流程**：toast 与提示条均不阻断模型切换与发送。
- **暗色模式**：警告条与徽标均提供 `dark:` 配色。
- **验证**：`bun run typecheck` 通过；手动验证下拉提示条常驻、SaaS 行徽标、选中 SaaS 弹 toast、本地模型不弹。
