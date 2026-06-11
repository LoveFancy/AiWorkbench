# SkillHub 登录流程改造方案

> 版本：v1.0
> 日期：2026-06-11
> 状态：设计阶段
> 关联文档：[skillhub-auth-design.md](./skillhub-auth-design.md) v5.0

---

## 一、问题描述

### 当前行为

用户在未登录 EIP 网关的情况下，进入 **设置 → SKILL/MCP → 华泰 SkillHub** 标签页，会看到"请先登录 EIP 网关后连接 SkillHub"提示，下方有一个"前往登录"按钮。

点击"前往登录"后：

```
用户点击"前往登录"
  → SkillHubPanel.handleAuthenticate()
    → window.electronAPI.skillHubAuthenticate()
      → IPC: AGENT_IPC_CHANNELS.SKILLHUB_AUTHENTICATE
        → exchangeToken()
          → getToken() → null（未登录，无 EIPGW-TOKEN）
            → throw Error("EIP 未登录，请先登录 EIP 网关")
              → toast.error("请先登录 EIP 网关，认证 SkillHub 需要 EIP 凭证")
```

结果：弹出一个 toast 提示"请先登录 EIP 网关"，用户不知道该怎么登录。

### 期望行为

参考 **设置 → 模型配置 → 泰为平台模型** 的交互模式：

1. 用户未登录时，SkillHub 面板显示"请登录 OA 后访问 SkillHub" + **登录 OA** 按钮
2. 点击"登录 OA"→ 关闭设置面板 → 打开登录对话框
3. 用户完成登录 → 自动重新打开设置面板
4. SkillHub 自动检测登录状态 → 尝试 SkillHub 认证 → 正常展示 Skill 列表

---

## 二、参考实现：泰为平台模型

`src/platform-models/PlatformModelsSection.tsx` 已有成熟的登录引导模式：

```typescript
// ===== 核心依赖 =====
import { authStateAtom, loginDialogOpenAtom } from '@/auth/renderer'
import { settingsOpenAtom } from '@/atoms/settings-tab'

// ===== 登录流程 =====
const authState = useAtomValue(authStateAtom)
const setLoginDialogOpen = useSetAtom(loginDialogOpenAtom)
const setSettingsOpen = useSetAtom(settingsOpenAtom)
const isLoggedIn = authState.isLoggedIn

// 标记：是否从本组件触发的登录
const loginRequestedRef = React.useRef(false)

// 登录按钮点击
const handleLoginClick = useCallback(() => {
  loginRequestedRef.current = true
  setSettingsOpen(false)                    // ① 关闭设置面板
  setTimeout(() => setLoginDialogOpen(true), 200)  // ② 延迟打开登录对话框
}, [setSettingsOpen, setLoginDialogOpen])

// 登录完成后，重新打开设置面板
React.useEffect(() => {
  if (isLoggedIn && loginRequestedRef.current) {
    loginRequestedRef.current = false
    setSettingsOpen(true)                   // ③ 登录成功后重开设置
  }
}, [isLoggedIn])
```

---

## 三、改造方案

### 3.1 改造范围

仅涉及一个文件：

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/renderer/components/settings/SkillHubPanel/SkillHubPanel.tsx` | ✏️ 修改 | 增强未登录状态处理 |
| `src/renderer/components/settings/SkillHubPanel/AuthStatusBar.tsx` | ✏️ 修改 | 配合新登录流程调整 UI |

其他文件 **不改动**：
- `skillhub-auth-service.ts` — `exchangeToken()` 逻辑不变，保持原始认证流程
- `skillhub-service.ts` — 业务 API 不变
- `ipc.ts` — IPC 注册不变
- `preload/index.ts` — preload 桥接不变
- `AgentSettings.tsx` — SkillHub 面板接入方式不变

### 3.2 核心改动：SkillHubPanel.tsx

#### 3.2.1 新增依赖

```typescript
// 新增 import
import { useAtomValue, useSetAtom } from 'jotai'
import { authStateAtom, loginDialogOpenAtom } from '@/auth/renderer'
import { settingsOpenAtom } from '@/atoms/settings-tab'
import { LogIn } from 'lucide-react'
```

#### 3.2.2 新增状态与逻辑

```typescript
// ===== 渐进式改动：在组件内部新增以下代码 =====

// 1. 读取登录状态
const authState = useAtomValue(authStateAtom)
const isLoggedIn = authState.isLoggedIn
const setLoginDialogOpen = useSetAtom(loginDialogOpenAtom)
const setSettingsOpen = useSetAtom(settingsOpenAtom)
const loginRequestedRef = React.useRef(false)

// 2. 替换原有的 handleAuthenticate，新增 handleLoginClick
//    （保留原有 handleAuthenticate 不变，供已登录后的 SkillHub 认证使用）

// 新增：跳转到 OA 登录的按钮处理
const handleLoginClick = React.useCallback(() => {
  loginRequestedRef.current = true
  setSettingsOpen(false)                       // 关闭设置面板
  setTimeout(() => setLoginDialogOpen(true), 200) // 延迟打开登录对话框
}, [setSettingsOpen, setLoginDialogOpen])

// 3. 登录完成后自动重开设置面板 + 重新检测 SkillHub 认证状态
React.useEffect(() => {
  if (isLoggedIn && loginRequestedRef.current) {
    loginRequestedRef.current = false
    setSettingsOpen(true)
    // 重新打开后自动检测 SkillHub 认证状态
    // checkAuth() 会在 settingsOpen 变为 true 后自然触发（因为组件重新 mount 或已有 useEffect 依赖）
  }
}, [isLoggedIn, setSettingsOpen])

// 4. 监听登录状态变化，自动尝试 SkillHub 认证
React.useEffect(() => {
  if (isLoggedIn && authStatus?.authenticated === false) {
    // 用户刚登录了 OA，自动尝试 SkillHub 认证
    void handleAuthenticate()
  }
}, [isLoggedIn])
```

#### 3.2.3 修改未登录状态的 UI

**修改前**（当前代码 L635-L640）：

```tsx
{/* 未认证 */}
{!authStatus?.authenticated && !authLoading && (
  <div className="text-center py-12 text-muted-foreground">
    <p className="text-sm mb-2">请先登录 EIP 网关后连接 SkillHub</p>
    <Button size="sm" variant="outline" onClick={handleAuthenticate}>
      <ShieldCheck size={14} className="mr-1" />
      前往登录
    </Button>
  </div>
)}
```

**修改后**：

```tsx
{/* 未登录 EIP（OA 未登录） */}
{!isLoggedIn && (
  <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
    <p className="text-sm">请登录 OA 后访问华泰 SkillHub</p>
    <Button size="sm" onClick={handleLoginClick}>
      <LogIn size={14} />
      <span className="ml-1">登录 OA</span>
    </Button>
  </div>
)}

{/* 已登录但 SkillHub 未认证（认证流程中的中间态） */}
{isLoggedIn && !authStatus?.authenticated && !authLoading && (
  <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
    <p className="text-sm">正在连接 SkillHub...</p>
    <Button size="sm" variant="outline" onClick={handleAuthenticate}>
      <ShieldCheck size={14} className="mr-1" />
      连接 SkillHub
    </Button>
  </div>
)}
```

#### 3.2.4 修改 AuthStatusBar 的"未认证"状态

当前 `AuthStatusBar` 的"未认证"状态显示一个黄色 warning 条 + "前往登录"按钮（调用 `onAuthenticate`）。改造后应区分两种情况：

1. **OA 未登录** → 不显示 AuthStatusBar，交由上方的 `!isLoggedIn` 区块处理
2. **OA 已登录但 SkillHub 认证失败/未认证** → AuthStatusBar 显示黄色条，文案改为"SkillHub 未认证，无法获取技能"，按钮改为"重试认证"

```typescript
// AuthStatusBar 中，未认证状态文案调整：
// 原："未登录 SkillHub" + "前往登录" 按钮
// 改为："SkillHub 未认证，无法获取技能" + "重试认证" 按钮
// 因为此状态仅在 OA 已登录时出现，需要引导用户重试 SkillHub 认证
```

### 3.3 完整状态流转图

```
┌─────────────────────────────────────────────────────────────┐
│              华泰 SkillHub 页面状态机                        │
├──────────────┬──────────────────┬──────────────────────────┤
│ EIP OA 状态   │ SkillHub 认证状态  │ UI 展示                   │
├──────────────┼──────────────────┼──────────────────────────┤
│ 未登录        │ -                │ "请登录 OA 后访问..."       │
│              │                  │ [登录 OA] 按钮             │
├──────────────┼──────────────────┼──────────────────────────┤
│ 已登录        │ 认证中            │ "正在连接 SkillHub..."     │
│              │                  │ （loading spinner）        │
├──────────────┼──────────────────┼──────────────────────────┤
│ 已登录        │ 未认证/失败       │ AuthStatusBar: 未登录     │
│              │                  │ + "重试认证" 按钮           │
│              │                  │ + 下方待认证占位            │
├──────────────┼──────────────────┼──────────────────────────┤
│ 已登录        │ 已认证            │ AuthStatusBar: 已连接     │
│              │                  │ + Skill 列表正常展示        │
├──────────────┼──────────────────┼──────────────────────────┤
│ 已登录        │ 网络不可用         │ AuthErrorBar: 不可用      │
│              │                  │ + "重试" 按钮              │
└──────────────┴──────────────────┴──────────────────────────┘

触发流程：
用户点击 [登录 OA] 
  → setSettingsOpen(false)       // 关闭设置
  → setLoginDialogOpen(true)      // 弹出登录框
  → 用户输入工号+密码
  → 登录成功 → authState.isLoggedIn = true
  → useEffect 触发
    → setSettingsOpen(true)       // 重开设置
    → 自动调用 handleAuthenticate() // SkillHub 认证
    → 认证成功 → 展示 Skill 列表
```

### 3.4 关键设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 不修改 `exchangeToken()` | ✅ | 换票逻辑不变，保留原有 `getToken() → Cookie → POST /auth/token` 流程 |
| 不在 `handleAuthenticate` 里直接触发登录 | ✅ | 复用 `PlatformModelsSection` 的成熟模式，保持一致性 |
| 区分"EIP未登录"和"SkillHub认证失败" | ✅ | 用户能明确知道问题在哪一步，不会困惑 |
| 登录后自动触发 SkillHub 认证 | ✅ | 减少用户操作步骤，体验流畅 |
| 保留原 `handleAuthenticate` 函数 | ✅ | 已登录但 SkillHub token 过期时仍需手动重试 |

---

## 四、与现有代码的兼容性

### 4.1 不影响现有 SkillHub 正常流程

所有 SkillHub 后端交互保持不变：
- `skillHubAuthenticate()` IPC → `exchangeToken()` 不变
- `skillHubFetch()` 自动注入 Bearer 不变
- `getValidSkillHubToken()` 缓存/刷新策略不变

### 4.2 不影响其他登录入口

- LeftSidebar 底部的"登录/退出"按钮不受影响
- 其他地方调用 `setLoginDialogOpen(true)` 不受影响
- `loginDialogOpenAtom` 只被 set，无竞争条件

### 4.3 settingsOpen 的关闭/重开

- 关闭设置通过 `setSettingsOpen(false)`，与 SettingsDialog 的 `onOpenChange` 一致
- 重开通过 `setSettingsOpen(true)`，Radix Dialog 会正常渲染

---

## 五、实施清单

| # | 文件 | 改动内容 |
|---|------|---------|
| 1 | `SkillHubPanel.tsx` | 添加 `authStateAtom` / `loginDialogOpenAtom` / `settingsOpenAtom` 依赖 |
| 2 | `SkillHubPanel.tsx` | 添加 `handleLoginClick` 函数（关闭设置→打开登录） |
| 3 | `SkillHubPanel.tsx` | 添加 2 个 `useEffect`：登录后重开设置 + 自动 SkillHub 认证 |
| 4 | `SkillHubPanel.tsx` | 渲染逻辑：`!isLoggedIn` 时显示"登录 OA"按钮，替代原"前往登录" |
| 5 | `AuthStatusBar.tsx` | "未认证"状态：文案从"未登录 SkillHub"改为"SkillHub 未认证，无法获取技能"，按钮从"前往登录"改为"重试认证" |

### 预估改动量

- `SkillHubPanel.tsx`：新增 ~30 行，修改 ~10 行
- `AuthStatusBar.tsx`：修改 1 行（按钮文案）
- 总计约 40 行改动，不涉及 IPC/后端/新文件

---

## 六、测试要点

| 场景 | 预期行为 |
|------|---------|
| 未登录 OA → 点击"华泰 SkillHub" | 显示"请登录 OA" + 登录按钮 |
| 点击"登录 OA" | 设置面板关闭 → 弹出登录对话框 |
| 在登录对话框中输入工号+密码登录 | 登录成功 → 设置面板自动重开 → SkillHub 自动认证 |
| 登录成功 + SkillHub 认证成功 | Skill 列表正常加载 |
| 登录成功 + SkillHub 认证失败（500/网络） | 显示 AuthErrorBar + 重试按钮 |
| 已登录 OA → 直接进 SkillHub | 正常显示（与当前一致） |
| 退出 OA 登录后进入 SkillHub | 回到"请登录 OA"状态 |

---

## 七、示意图

### 当前流程（有问题）

```
┌──────────────────────────────┐
│  华泰 SkillHub                │
│                               │
│  ⚠️ 未登录 SkillHub            │
│  [前往登录]                    │  ← 点击后 toast "请先登录 EIP 网关"
│                               │     用户不知道去哪登录
│  请先登录 EIP 网关后连接 SkillHub│
│                               │
│  [前往登录]                    │
└──────────────────────────────┘
```

### 改造后流程

```
┌──────────────────────────────┐
│  华泰 SkillHub                │
│                               │            ┌─────────────────┐
│  🔒 请登录 OA 后访问华泰       │  点击      │   登录对话框      │
│      SkillHub                 │──────────→│                 │
│  [🔑 登录 OA]                 │  关闭设置   │  工号: [____]   │
│                               │            │  密码: [____]   │
│                               │            │  [登 录]        │
└──────────────────────────────┘            └────────┬────────┘
                                                     │ 登录成功
┌──────────────────────────────┐                     │
│  华泰 SkillHub                │  ← 自动重开设置     │
│                               │ ←─────────────────┘
│  ✅ 已连接 · Skill 列表可用    │  ← 自动 SkillHub 认证
│                               │
│  📦 Skill-1                  │
│  📦 Skill-2                  │
│  ...                         │
└──────────────────────────────┘
```
