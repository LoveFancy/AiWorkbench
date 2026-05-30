# Configurable Data Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users configure Proma's application data directory from General Settings.

**Architecture:** Store the custom data root in a stable bootstrap file under the default data directory, then make `getConfigDir()` resolve through that bootstrap config. Settings UI writes pending changes and tells the user to restart before the new root is used.

**Tech Stack:** Electron main process IPC, TypeScript, React, Jotai-adjacent renderer settings flow, Bun tests.

---

### Task 1: Bootstrap Config Root Service

**Files:**
- Create: `apps/electron/src/main/lib/config-root-service.ts`
- Create: `apps/electron/src/main/lib/config-root-service.test.ts`
- Modify: `apps/electron/src/main/lib/config-paths.ts`

- [ ] Write failing tests for default path, custom path, invalid JSON fallback, invalid relative path rejection, and reset.
- [ ] Run `bun test apps/electron/src/main/lib/config-root-service.test.ts` and verify tests fail because the service does not exist.
- [ ] Implement bootstrap read/write/reset helpers and integrate `getConfigDir()`.
- [ ] Re-run the config root service test and verify it passes.

### Task 2: Settings IPC And Preload API

**Files:**
- Modify: `apps/electron/src/types/settings.ts`
- Modify: `apps/electron/src/main/ipc.ts`
- Modify: `apps/electron/src/preload/index.ts`

- [ ] Add `ConfigRootInfo` and settings IPC channel constants.
- [ ] Add IPC handlers for get, choose, set, and reset config root.
- [ ] Expose matching preload methods on `ElectronAPI`.
- [ ] Run `bun run typecheck` and fix type errors in these surfaces.

### Task 3: General Settings UI

**Files:**
- Modify: `apps/electron/src/renderer/components/settings/GeneralSettings.tsx`

- [ ] Load config root info on mount.
- [ ] Add a "数据目录" row showing current and pending paths.
- [ ] Add "选择目录" and "恢复默认" actions.
- [ ] Show Chinese error and restart-required messages.

### Task 4: Path Display Cleanup

**Files:**
- Modify: `apps/electron/src/main/lib/agent-prompt-builder.ts`
- Modify: `apps/electron/src/main/lib/agent-prompt-builder.test.ts`
- Modify: `apps/electron/src/renderer/components/settings/AgentSettings.tsx`

- [ ] Replace hard-coded `~/.proma-dev` style display with real config-root-derived paths where practical.
- [ ] Update affected tests.

### Task 5: Verification

- [ ] Run `bun test apps/electron/src/main/lib/config-root-service.test.ts`.
- [ ] Run targeted tests affected by path prompt changes.
- [ ] Run `bun run typecheck`.
- [ ] Review `git diff` to ensure unrelated dirty files were not reverted.
