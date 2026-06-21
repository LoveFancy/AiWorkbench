# Session Scoped Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load third-party MCP connectors only when the current Agent session explicitly selects them, and let the Huatai email connector initialize its own dependency and MCP config.

**Architecture:** Add a structured `selectedMcpServers` field to Agent sends, change workspace MCP building to accept an allow-list, and add a renderer connector picker that stores selected connector names per session. Add a main-process connector initialization service for `personal-email` that checks Python/pip, installs `mcp-email-server` when missing, writes IMAP-only MCP config, and returns step statuses for the UI.

**Tech Stack:** Bun tests, TypeScript, Electron IPC, React, Jotai, existing MCP validator and workspace MCP config APIs.

---

### Task 1: Session-Scoped MCP Build

**Files:**
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `apps/electron/src/main/lib/orchestrator/mcp-builder.ts`
- Test: `apps/electron/src/main/lib/orchestrator/mcp-builder.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests that assert `buildMcpServers(workspaceSlug, [])` does not load workspace MCP and `buildMcpServers(workspaceSlug, ['email'])` only loads `email`.

- [ ] **Step 2: Run test to verify failure**

Run: `bun test apps/electron/src/main/lib/orchestrator/mcp-builder.test.ts`

- [ ] **Step 3: Implement allow-list**

Add `selectedMcpServers?: string[]` to `AgentSendInput`. Update `buildMcpServers(workspaceSlug, selectedMcpServers)` to load no workspace MCP when the list is empty or omitted, and only matching enabled entries when provided.

- [ ] **Step 4: Pass selected MCP names from orchestrator**

Change `agent-orchestrator.ts` to call `buildMcpServers(workspaceSlug, selectedMcpServers ?? mentionedMcpServers)`, then remove `mentionedMcpServers` fallback after the frontend is updated.

### Task 2: Remove #mcp Mention Trigger

**Files:**
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `apps/electron/src/renderer/components/agent/AgentView.tsx`
- Modify: `apps/electron/src/renderer/components/agent/mention-suggestions.tsx`
- Test: `apps/electron/src/renderer/components/agent/mention-suggestions.test.ts`

- [ ] **Step 1: Write failing tests**

Assert the mention source no longer contains `#mcp:` parsing or MCP suggestion text.

- [ ] **Step 2: Remove parsing and prompt injection**

Delete parsing of `#mcp:(\S+)` from `AgentView.tsx`. Keep `/skill:` and `&session:` parsing. Remove MCP mention config and any dialog提示话术 that tells the user to use `#mcp`.

### Task 3: Connector Initialization IPC

**Files:**
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `apps/electron/src/preload/index.ts`
- Modify: `apps/electron/src/main/ipc.ts`
- Create: `apps/electron/src/main/lib/default-connector-initializer.ts`
- Test: `apps/electron/src/main/lib/default-connector-initializer.test.ts`

- [ ] **Step 1: Write failing tests**

Test that Huatai initialization writes `servers.email` as `mcp-email-server`, `args: ['stdio']`, enabled, IMAP-only, and preserves existing MCP servers.

- [ ] **Step 2: Implement initializer**

Add an initializer that detects Python/pip, detects `mcp-email-server`, runs `pip install mcp-email-server` only if missing, writes the config, validates the command, and returns ordered step results.

- [ ] **Step 3: Wire IPC**

Expose `initializeDefaultConnector(workspaceSlug, input)` to renderer through shared channel, main IPC, and preload.

### Task 4: Connector Picker UI

**Files:**
- Create: `apps/electron/src/renderer/components/agent/AgentConnectorPicker.tsx`
- Test: `apps/electron/src/renderer/components/agent/AgentConnectorPicker.test.ts`
- Modify: `apps/electron/src/renderer/atoms/agent-atoms.ts`
- Modify: `apps/electron/src/renderer/components/agent/AgentView.tsx`

- [ ] **Step 1: Write failing tests**

Test helper filters enabled MCP entries, excludes uninitialized entries, and source includes “更多连接器”.

- [ ] **Step 2: Add state and picker**

Add a Jotai map `agentSelectedMcpServersAtom` keyed by session id. Render picker in input toolbar. It lists configured connectors from `getWorkspaceMcpConfig`, toggles selected names, and has “更多连接器” opening Agent 技能 > 连接器.

- [ ] **Step 3: Send selected connectors**

Pass selected names as `selectedMcpServers` in `sendAgentMessage`, retry, and retry-in-new-session where relevant.

### Task 5: Huatai Dialog Initialization Status

**Files:**
- Modify: `apps/electron/src/renderer/components/agent-skills/AgentSkillsView.tsx`
- Test: `apps/electron/src/renderer/components/agent-skills/default-connectors.test.ts`

- [ ] **Step 1: Write failing tests**

Assert dialog source contains “检查环境”, “安装 mcp-email-server”, “自检连接器”, and no longer says “完成连接测试后再启用”.

- [ ] **Step 2: Use initializer IPC**

Replace direct `saveWorkspaceMcpConfig` in `HuataiEmailConnectorDialog` with `initializeDefaultConnector`. Show current step status and success/error toast.

### Task 6: Verification

Run:
- `bun test apps/electron/src/main/lib/orchestrator/mcp-builder.test.ts apps/electron/src/main/lib/default-connector-initializer.test.ts`
- `bun test apps/electron/src/renderer/components/agent/AgentConnectorPicker.test.ts apps/electron/src/renderer/components/agent/mention-suggestions.test.ts apps/electron/src/renderer/components/agent-skills/default-connectors.test.ts`
- `bun run typecheck` from `apps/electron` if scoped tests pass.

