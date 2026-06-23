# SaaS 模型敏感数据提示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在模型选择下拉与候选配置弹窗中持续提醒「敏感数据请勿使用 SaaS 模型」，并在每次选中 SaaS 模型时弹出非阻断 toast。

**Architecture:** 纯前端展示层改动。在 `ModelSelector.tsx` 新增 SaaS 判定 helper、顶部固定警告条、SaaS 行徽标、选中时 sonner toast；在 `CandidateModelDialog.tsx` 对齐文案。无状态、存储或后端改动。

**Tech Stack:** React + TypeScript、Tailwind、lucide-react（Shield 图标）、sonner（toast）、bun（typecheck/test）。

**Spec:** `docs/客户端/优化/客户端-SaaS模型敏感数据提示方案.md`

---

### Task 1: 新增并测试 `isSaasModel` 判定 helper

**Files:**
- Modify: `apps/electron/src/renderer/components/chat/ModelSelector.tsx`（在 import 之后、`buildModelOptions` 之前的 Helpers 区，约 L27）
- Test: `apps/electron/src/renderer/components/chat/ModelSelector.saas.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

新建 `apps/electron/src/renderer/components/chat/ModelSelector.saas.test.ts`：

```ts
import { describe, expect, test } from 'bun:test'
import { isSaasModel } from './ModelSelector'

describe('isSaasModel', () => {
  test('识别 saas- 前缀模型', () => {
    expect(isSaasModel('saas-doubao-15-pro-32k')).toBe(true)
  })

  test('大小写不敏感', () => {
    expect(isSaasModel('SAAS-doubao')).toBe(true)
  })

  test('本地模型返回 false', () => {
    expect(isSaasModel('local-qwen36-27b')).toBe(false)
  })

  test('非 saas 前缀返回 false', () => {
    expect(isSaasModel('gpt-4o')).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test apps/electron/src/renderer/components/chat/ModelSelector.saas.test.ts`
Expected: FAIL，提示 `isSaasModel` 未导出 / 不存在。

- [ ] **Step 3: 实现 helper**

在 `ModelSelector.tsx` 中 `import` 区之后、`buildModelOptions` 函数之前插入：

```ts
/** 判定模型是否为 SaaS 云端模型（数据经第三方处理，存在泄露风险） */
export function isSaasModel(modelId: string): boolean {
  return modelId.toLowerCase().startsWith('saas-')
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test apps/electron/src/renderer/components/chat/ModelSelector.saas.test.ts`
Expected: PASS（4 个用例全过）。

- [ ] **Step 5: 提交**

```bash
git add apps/electron/src/renderer/components/chat/ModelSelector.tsx apps/electron/src/renderer/components/chat/ModelSelector.saas.test.ts
git commit -m "feat: 新增 isSaasModel 判定 helper"
```

---

### Task 2: 模型下拉顶部固定 SaaS 安全警告条

**Files:**
- Modify: `apps/electron/src/renderer/components/chat/ModelSelector.tsx`
  - import 行（约 L10）：`Search, Settings2` 旁加入 `Shield`
  - `PopoverContent` 内、`{/* Auto Mode 开关区 */}` 之前（约 L307-308）

- [ ] **Step 1: 引入 Shield 图标**

将：

```tsx
import { ChevronDown, Cpu, Search, Settings2 } from 'lucide-react'
```

改为：

```tsx
import { ChevronDown, Cpu, Search, Settings2, Shield } from 'lucide-react'
```

- [ ] **Step 2: 在 PopoverContent 顶部插入警告条**

定位到 `PopoverContent` 内部第一个子元素 `{/* Auto Mode 开关区 */}`（约 L307），在其**之前**插入：

```tsx
{/* SaaS 安全提示（始终可见） */}
<div className="px-3.5 py-2.5 border-b border-border/60 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
  <Shield className="size-3.5 mt-0.5 flex-shrink-0" />
  <span>敏感数据请勿使用 SaaS 模型，建议优先选择本地（local）模型。</span>
</div>

{/* Auto Mode 开关区 */}
```

- [ ] **Step 3: typecheck**

Run: `bun run typecheck`
Expected: PASS，无类型错误。

- [ ] **Step 4: 提交**

```bash
git add apps/electron/src/renderer/components/chat/ModelSelector.tsx
git commit -m "feat: 模型下拉顶部新增 SaaS 敏感数据警告条"
```

---

### Task 3: SaaS 模型行徽标

**Files:**
- Modify: `apps/electron/src/renderer/components/chat/ModelSelector.tsx`（模型行渲染处，多模态/文本徽标之后，约 L449-458 之间）

- [ ] **Step 1: 在模型行加入 SaaS 徽标**

定位模型行中「多模态 / 文本」徽标块结尾（`{option.supportsMultimodal ? (...) : (...)}` 之后、`Auto` 徽标块之前，约 L458），插入：

```tsx
{isSaasModel(option.modelId) && (
  <span className="inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
    云端 (SaaS)
  </span>
)}
```

- [ ] **Step 2: typecheck**

Run: `bun run typecheck`
Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add apps/electron/src/renderer/components/chat/ModelSelector.tsx
git commit -m "feat: 模型列表中标识 SaaS 云端模型"
```

---

### Task 4: 选中 SaaS 模型时非阻断 toast

**Files:**
- Modify: `apps/electron/src/renderer/components/chat/ModelSelector.tsx`
  - import 区加入 `import { toast } from 'sonner'`
  - `handleSelect`（约 L214-236）函数体起始处

- [ ] **Step 1: 引入 toast**

在 import 区（`import { cn } from '@/lib/utils'` 之后）加入：

```tsx
import { toast } from 'sonner'
```

- [ ] **Step 2: 在 handleSelect 起始处加 toast**

将 `handleSelect` 开头：

```tsx
const handleSelect = (option: ModelOption): void => {
  if (onModelSelect) {
```

改为：

```tsx
const handleSelect = (option: ModelOption): void => {
  if (isSaasModel(option.modelId)) {
    toast.warning('已切换到 SaaS 云端模型', {
      description: '敏感数据请勿使用 SaaS 模型，数据将经第三方云服务处理。',
    })
  }
  if (onModelSelect) {
```

（toast 置于 `onModelSelect` 提前 return 分支之前，保证两条选择路径都会提醒；toast 非阻断，切换逻辑不变。）

- [ ] **Step 3: typecheck**

Run: `bun run typecheck`
Expected: PASS。

- [ ] **Step 4: 手动验证**

启动客户端，打开模型下拉：
- 选中任一 `saas-*` 模型 → 右下角出现警告 toast，模型正常切换。
- 选中 `local-*` 模型 → 不出现 toast。
- 再次选中同一 SaaS 模型 → 仍出现 toast（不去重）。

- [ ] **Step 5: 提交**

```bash
git add apps/electron/src/renderer/components/chat/ModelSelector.tsx
git commit -m "feat: 选中 SaaS 模型时弹出非阻断安全提醒"
```

---

### Task 5: 候选配置弹窗文案对齐

**Files:**
- Modify: `apps/electron/src/renderer/components/settings/CandidateModelDialog.tsx`
  - 顶部安全提示（约 L237）
  - SaaS 确认对话框描述（约 L327）

- [ ] **Step 1: 对齐顶部提示文案**

将（约 L237）：

```tsx
<span>为保障数据安全，建议仅勾选本地模型。勾选 SaaS 模型可能导致敏感数据在自动切换时被发送至第三方服务。</span>
```

改为：

```tsx
<span>敏感数据请勿使用 SaaS 模型。建议仅勾选本地模型，勾选 SaaS 模型可能导致敏感数据在自动切换时被发送至第三方服务。</span>
```

- [ ] **Step 2: 对齐 SaaS 确认弹窗文案**

将（约 L327）：

```tsx
<DialogDescription>
  该模型为云端服务，自动切换时可能将对话上下文发送至第三方服务器，存在数据泄露风险。确定要添加吗？
</DialogDescription>
```

改为：

```tsx
<DialogDescription>
  敏感数据请勿使用 SaaS 模型。该模型为云端服务，自动切换时可能将对话上下文发送至第三方服务器，存在数据泄露风险。确定要添加吗？
</DialogDescription>
```

- [ ] **Step 3: typecheck**

Run: `bun run typecheck`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add apps/electron/src/renderer/components/settings/CandidateModelDialog.tsx
git commit -m "feat: 候选模型弹窗对齐 SaaS 敏感数据提示文案"
```

---

## 自查结论

- **Spec 覆盖**：3.1→Task1、3.2→Task2、3.3→Task3、3.4→Task4、3.5→Task5，全部覆盖。
- **占位符**：无 TBD/TODO，所有步骤含具体代码与命令。
- **类型一致**：`isSaasModel(modelId: string): boolean` 在 Task1 定义并 export，Task3/Task4 调用签名一致。
- **样式一致**：警告条/徽标均使用 amber 配色 + `dark:` 变体，与 `CandidateModelDialog` 现有提示一致。
