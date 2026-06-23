# 账号区交互优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将左侧栏底部账号区收敛为一个“账户与设置”入口，并让未登录弹层内登录和设置动作各只出现一次。

**Architecture:** 保持现有 `UserAccountMenu` / `GuestAccountMenu` 组件边界，不新增状态。`LeftSidebar` 只负责渲染账户菜单触发器，弹层内动作由 `UserAccountMenu.tsx` 管理。

**Tech Stack:** React 18、TypeScript、Jotai、Radix DropdownMenu、Bun test。

---

## File Structure

- Modify: `apps/electron/src/renderer/components/app-shell/UserAccountMenu.test.ts`
  - 用源码级 BDD 断言锁定本次交互规则，防止后续再次出现重复登录和重复设置。
- Modify: `apps/electron/src/renderer/components/app-shell/UserAccountMenu.tsx`
  - 调整 `GuestAccountMenu` 触发器文案和未登录弹层结构。
  - 删除未登录菜单列表里的重复登录项。
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
  - 删除展开状态底部独立设置按钮，只保留账户菜单组件。

### Task 1: Account Hub Interaction

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/UserAccountMenu.test.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/UserAccountMenu.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`

- [ ] **Step 1: Write the failing test**

Add source slices and assertions to `UserAccountMenu.test.ts`:

```ts
const guestMenuSource = menuSource.slice(
  menuSource.indexOf('export function GuestAccountMenu'),
  menuSource.indexOf('function ThemeQuickSwitch'),
)

const expandedFooterSource = sidebarSource.slice(
  sidebarSource.indexOf('{/* 底部：用户菜单 + 设置入口 */}'),
  sidebarSource.indexOf('{deleteDialog}', sidebarSource.indexOf('{/* 底部：用户菜单 + 设置入口 */}')),
)
```

Add tests:

```ts
test('未登录触发器使用账户中心语义而不是重复登录动作', () => {
  expect(guestMenuSource).toContain('账户与设置')
  expect(guestMenuSource).not.toContain('<span className="flex-1 truncate text-left text-sm">\\n              登录 OA 账号\\n            </span>')
})

test('未登录弹窗只保留一个登录主动作', () => {
  expect(guestMenuSource.match(/登录 OA 账号/g)?.length).toBe(1)
  expect(guestMenuSource).toContain('onClick={onLogin}')
  expect(guestMenuSource).not.toContain('label="登录 OA 账号"')
})

test('展开侧栏底部不再渲染账户菜单外的独立设置按钮', () => {
  expect(expandedFooterSource).not.toContain('<Settings size={16} />')
  expect(expandedFooterSource).not.toContain('TooltipContent side="top">设置</TooltipContent>')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test apps/electron/src/renderer/components/app-shell/UserAccountMenu.test.ts
```

Expected: FAIL because `账户与设置` is absent, `登录 OA 账号` appears more than once in `GuestAccountMenu`, and the expanded footer still contains the standalone settings button.

- [ ] **Step 3: Write minimal implementation**

In `UserAccountMenu.tsx`, change the uncollapsed guest trigger label:

```tsx
<span className="flex-1 truncate text-left text-sm">
  账户与设置
</span>
```

Replace the guest popover header and remove the list login item:

```tsx
<div className="px-4 pb-3 pt-4">
  <button
    type="button"
    onClick={onLogin}
    className="flex w-full items-center gap-3 rounded-[16px] bg-foreground px-4 py-3 text-left text-background transition-colors hover:bg-foreground/90"
  >
    <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-background/15 text-background">
      <LogIn size={20} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[15px] font-semibold leading-5">登录 OA 账号</span>
      <span className="block truncate text-xs text-background/70">登录后同步 OA 账号状态</span>
    </span>
  </button>
</div>
```

Remove this menu item from `GuestAccountMenu`:

```tsx
<AccountMenuItem
  icon={<LogIn size={20} />}
  label="登录 OA 账号"
  onSelect={onLogin}
/>
```

In `LeftSidebar.tsx`, remove the standalone settings button block under the expanded footer and leave only:

```tsx
<div className="px-3 pb-3 flex flex-col gap-1">
  <div className="flex items-center gap-1">
    {authState.isLoggedIn ? (
      <UserAccountMenu
        userProfile={userProfile}
        jobId={authState.jobId}
        hasAttention={hasUpdate || hasEnvironmentIssues}
        onOpenManual={handleOpenManual}
        onLogout={handleLogout}
      />
    ) : (
      <GuestAccountMenu
        hasAttention={hasUpdate || hasEnvironmentIssues}
        onOpenManual={handleOpenManual}
        onLogin={handleLogin}
      />
    )}
  </div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
bun test apps/electron/src/renderer/components/app-shell/UserAccountMenu.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run focused type safety check**

Run:

```bash
bun run typecheck
```

Expected: PASS or only pre-existing unrelated failures. If failures point to touched files, fix them before completion.

- [ ] **Step 6: Commit touched files only if requested**

Because this working tree can contain unrelated user changes, do not commit by default. If a commit is requested, include only:

```bash
git add docs/superpowers/specs/2026-06-22-account-menu-interaction-design.md docs/superpowers/plans/2026-06-22-account-menu-interaction.md apps/electron/src/renderer/components/app-shell/UserAccountMenu.test.ts apps/electron/src/renderer/components/app-shell/UserAccountMenu.tsx apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx
git commit --only docs/superpowers/specs/2026-06-22-account-menu-interaction-design.md docs/superpowers/plans/2026-06-22-account-menu-interaction.md apps/electron/src/renderer/components/app-shell/UserAccountMenu.test.ts apps/electron/src/renderer/components/app-shell/UserAccountMenu.tsx apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx -m "fix: simplify account menu interactions"
```
