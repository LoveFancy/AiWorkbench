# Agent Expert Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WorkMate Agent expert groups backed by plugins, allowing users to browse experts, create expert-bound Agent sessions, and run those sessions with expert-specific prompts and SubAgents.

**Architecture:** Expert groups are plugin-provided manifests under `expert-groups/*.json`. The main process scans installed plugins, validates expert manifests, builds an `ExpertGroupRuntime`, and the orchestrator merges that runtime into SDK `systemPrompt`, `agents`, `plugins`, and MCP options. The renderer exposes expert group catalog UI in Agent mode and settings while keeping session binding immutable.

**Tech Stack:** Bun, TypeScript, Electron IPC, React 18, Jotai, Radix/shadcn UI, lucide-react, Claude Agent SDK options.

---

## File Structure

- Modify `packages/shared/src/types/agent.ts`: add expert group types, session fields, IPC constants.
- Modify `apps/electron/src/main/lib/plugin-registry-service.ts`: parse `expertGroups` from plugin manifest and discover expert-group capabilities.
- Create `apps/electron/src/main/lib/agent-expert-group-manager.ts`: validate expert manifests and build runtime data.
- Create `apps/electron/src/main/lib/agent-expert-group-manager.test.ts`: cover scanning, validation, disabled plugin behavior, runtime conversion.
- Modify `apps/electron/src/main/lib/agent-session-manager.ts`: create sessions with expert binding and reject later binding mutation.
- Modify `apps/electron/src/main/lib/agent-prompt-builder.ts`: accept expert runtime and merge expert prompt/delegation.
- Modify `apps/electron/src/main/lib/agent-orchestrator.ts`: resolve expert runtime and merge agents/plugins/MCP.
- Modify `apps/electron/src/main/ipc.ts`: add expert group list/get handlers and extended session creation.
- Modify `apps/electron/src/preload/index.ts`: expose expert group API and extended session creation.
- Modify `apps/electron/src/renderer/atoms/agent-atoms.ts`: add expert group atoms.
- Modify `apps/electron/src/renderer/atoms/settings-tab.ts`, `apps/electron/src/renderer/components/settings/settings-tabs.tsx`, `SettingsPanel.tsx`: add settings tab.
- Create `apps/electron/src/renderer/components/expert-groups/*`: shared cards, detail dialog, status badge.
- Create `apps/electron/src/renderer/components/settings/ExpertGroupSettings.tsx`: settings catalog.
- Create `apps/electron/src/renderer/components/agent/ExpertSummonButton.tsx`, `ExpertGroupPicker.tsx`, `ExpertSummoningOverlay.tsx`: Agent summon flow.
- Modify `apps/electron/src/renderer/components/agent/AgentHeader.tsx` or `AgentView.tsx`: render summon entry.
- Create `apps/electron/bundled-plugins/workmate-experts/*`: built-in expert plugin with one MVP product expert group.
- Add or update tests near touched modules.

## Task 1: Shared Types And Plugin Manifest Support

**Files:**
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `apps/electron/src/main/lib/plugin-registry-service.ts`
- Modify: `apps/electron/src/main/lib/plugin-registry-service.test.ts`

- [ ] **Step 1: Add failing plugin test for expert group capability**

Add a test that writes `expertGroups: ['product-team']` into a plugin manifest and creates `expert-groups/product-team.json`. Assert `listInstalledPlugins()` includes an `expert-group` capability.

Run: `bun test apps/electron/src/main/lib/plugin-registry-service.test.ts`
Expected: FAIL because `expert-group` is not a valid capability type yet.

- [ ] **Step 2: Add shared expert group types**

Add `AgentExpertGroupManifest`, `AgentExpertGroupInfo`, `AgentExpertGroupStatus`, `AgentExpertGroupMainRole`, `AgentExpertGroupToolsPolicy`, and extend `AgentPluginCapabilityType` with `'expert-group'`. Add `expertGroups?: string[]` to `AgentPluginManifest`.

- [ ] **Step 3: Parse plugin manifest `expertGroups`**

Update `normalizeManifest()` in `plugin-registry-service.ts` to parse string-array `expertGroups`.

- [ ] **Step 4: Discover expert group capabilities**

Add `discoverExpertGroups(pluginPath, pluginId, sourceLabel, enabled, manifest)` that validates indexed files exist and scans unindexed `expert-groups/*.json` with warning issues. Include it in `capabilities`.

- [ ] **Step 5: Verify**

Run: `bun test apps/electron/src/main/lib/plugin-registry-service.test.ts`
Expected: PASS.

## Task 2: Expert Group Manager

**Files:**
- Create: `apps/electron/src/main/lib/agent-expert-group-manager.ts`
- Create: `apps/electron/src/main/lib/agent-expert-group-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:
- lists valid expert groups from enabled plugins
- excludes disabled plugin groups from summonable list
- marks invalid manifest issues
- resolves runtime with main prompt, referenced agents, skills, mcp names, plugin path

Run: `bun test apps/electron/src/main/lib/agent-expert-group-manager.test.ts`
Expected: FAIL because module does not exist.

- [ ] **Step 2: Implement manifest normalization**

Create safe JSON parsing helpers and validate required fields: `id`, `name`, `mainRole.name`, `mainRole.prompt`.

- [ ] **Step 3: Implement list/get APIs**

Implement `listAgentExpertGroups(paths?)` and `getAgentExpertGroup(input, paths?)` using `listInstalledPlugins()`.

- [ ] **Step 4: Implement runtime resolver**

Implement `resolveExpertGroupRuntime()` that reads plugin `agents/*.md` files for referenced subagents, builds `AgentDefinition`, validates referenced skills, and returns prompt hints plus plugin path.

- [ ] **Step 5: Verify**

Run: `bun test apps/electron/src/main/lib/agent-expert-group-manager.test.ts`
Expected: PASS.

## Task 3: Session Binding

**Files:**
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `apps/electron/src/main/lib/agent-session-manager.ts`
- Modify: `apps/electron/src/main/lib/agent-session-manager.test.ts`
- Modify: `apps/electron/src/main/ipc.ts`
- Modify: `apps/electron/src/preload/index.ts`

- [ ] **Step 1: Write failing session tests**

Assert `createAgentSession(title, channelId, workspaceId, expertGroupId, expertPluginId)` persists fields. Assert `updateAgentSessionMeta(id, { expertGroupId: 'x' })` is not allowed by the TypeScript update shape or throws defensively if forced.

- [ ] **Step 2: Extend `AgentSessionMeta`**

Add optional `expertGroupId` and `expertPluginId`.

- [ ] **Step 3: Extend creation only**

Add optional create parameters and write fields only when both are present.

- [ ] **Step 4: Keep binding immutable**

Do not add expert fields to `updateAgentSessionMeta()` accepted update keys. Add a defensive runtime check for `expertGroupId` or `expertPluginId` keys in `updates`.

- [ ] **Step 5: Wire IPC/preload**

Extend `createAgentSession` IPC/preload signatures with optional expert fields.

- [ ] **Step 6: Verify**

Run: `bun test apps/electron/src/main/lib/agent-session-manager.test.ts`
Expected: PASS.

## Task 4: Runtime Prompt And SDK Option Merge

**Files:**
- Modify: `apps/electron/src/main/lib/agent-prompt-builder.ts`
- Modify: `apps/electron/src/main/lib/agent-prompt-builder.test.ts`
- Modify: `apps/electron/src/main/lib/agent-orchestrator.ts`

- [ ] **Step 1: Write failing prompt tests**

Assert expert runtime prepends main role, injects expert mode summary, preserves WorkMate rules, and lists subagents/skills/mcp.

- [ ] **Step 2: Add expert runtime input**

Extend `SystemPromptContext` with `expertRuntime?: ExpertGroupRuntime`.

- [ ] **Step 3: Split default role/delegation helpers**

Extract default role and delegation text into helpers so expert mode can replace them without dropping common sections.

- [ ] **Step 4: Add `buildAgentsForSession()`**

Return `{ ...buildBuiltinAgents(), ...expertRuntime.agents }`.

- [ ] **Step 5: Resolve expert runtime in orchestrator**

Before building `queryOptions`, call `resolveExpertGroupRuntime()` when session has expert fields. Merge plugin paths and MCP servers with precedence `custom > expert > workspace`.

- [ ] **Step 6: Verify**

Run: `bun test apps/electron/src/main/lib/agent-prompt-builder.test.ts`
Expected: PASS.

## Task 5: Expert Group IPC And Renderer State

**Files:**
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `apps/electron/src/main/ipc.ts`
- Modify: `apps/electron/src/preload/index.ts`
- Modify: `apps/electron/src/renderer/atoms/agent-atoms.ts`

- [ ] **Step 1: Add IPC constants**

Add `LIST_EXPERT_GROUPS` and `GET_EXPERT_GROUP` to `AGENT_IPC_CHANNELS`.

- [ ] **Step 2: Add main handlers**

Register handlers returning `listAgentExpertGroups()` and `getAgentExpertGroup()`.

- [ ] **Step 3: Add preload API**

Expose `listAgentExpertGroups()` and `getAgentExpertGroup(input)`.

- [ ] **Step 4: Add Jotai atoms**

Add `agentExpertGroupsAtom`, `loadAgentExpertGroupsAtom`, `createExpertSessionAtom`.

- [ ] **Step 5: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS or only unrelated existing failures reported.

## Task 6: Settings Expert Group Catalog

**Files:**
- Modify: `apps/electron/src/renderer/atoms/settings-tab.ts`
- Modify: `apps/electron/src/renderer/components/settings/settings-tabs.tsx`
- Modify: `apps/electron/src/renderer/components/settings/SettingsPanel.tsx`
- Create: `apps/electron/src/renderer/components/settings/ExpertGroupSettings.tsx`
- Create: `apps/electron/src/renderer/components/expert-groups/ExpertGroupStatusBadge.tsx`
- Create: `apps/electron/src/renderer/components/expert-groups/ExpertGroupCard.tsx`
- Create: `apps/electron/src/renderer/components/expert-groups/ExpertGroupDetailDialog.tsx`

- [ ] **Step 1: Add failing settings tab test**

Update existing settings tab tests to expect `专家团` in Agent mode and absent in Chat mode.

- [ ] **Step 2: Add tab and panel**

Add `experts` tab, render `ExpertGroupSettings`.

- [ ] **Step 3: Build shared expert group display components**

Implement status badge, card, and detail dialog with source, status, main role, tags, subagents, skills, mcp, sample prompts.

- [ ] **Step 4: Build settings page**

Load expert groups via atom/API, group by builtin/user/error, support search, open detail.

- [ ] **Step 5: Verify UI tests**

Run: `bun test apps/electron/src/renderer/components/settings/settings-tabs.test.tsx`
Expected: PASS.

## Task 7: Agent Summon Flow

**Files:**
- Create: `apps/electron/src/renderer/components/agent/ExpertSummonButton.tsx`
- Create: `apps/electron/src/renderer/components/agent/ExpertGroupPicker.tsx`
- Create: `apps/electron/src/renderer/components/agent/ExpertSummoningOverlay.tsx`
- Modify: `apps/electron/src/renderer/components/agent/AgentHeader.tsx` or `AgentView.tsx`

- [ ] **Step 1: Add picker components**

Use shared cards/detail dialog, add summon button that calls `createExpertSessionAtom`.

- [ ] **Step 2: Create session on summon**

Create a session titled `{专家团名称} · 新任务`, pass current channel/workspace and expert IDs, switch current session atom.

- [ ] **Step 3: Show loading overlay**

Show `正在召唤专家团...` while session is being created.

- [ ] **Step 4: Render entry point**

Add `召唤专家` button to Agent header/input area.

- [ ] **Step 5: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS or only unrelated existing failures reported.

## Task 8: Built-In Expert Plugin

**Files:**
- Create: `apps/electron/bundled-plugins/workmate-experts/.claude-plugin/plugin.json`
- Create: `apps/electron/bundled-plugins/workmate-experts/expert-groups/product-team.json`
- Create: `apps/electron/bundled-plugins/workmate-experts/agents/requirement-analyst.md`
- Create: `apps/electron/bundled-plugins/workmate-experts/agents/ux-designer.md`
- Create: `apps/electron/bundled-plugins/workmate-experts/agents/tech-reviewer.md`

- [ ] **Step 1: Add built-in plugin manifest**

Add plugin name `workmate-experts`, version `0.1.0`, and `expertGroups: ['product-team']`.

- [ ] **Step 2: Add product expert group**

Add manifest with main role, subagents, tags, sample prompts, and no MCP dependency for MVP.

- [ ] **Step 3: Add subagent markdown files**

Add three focused agent prompts.

- [ ] **Step 4: Verify plugin scan**

Run: `bun test apps/electron/src/main/lib/plugin-registry-service.test.ts apps/electron/src/main/lib/agent-expert-group-manager.test.ts`
Expected: PASS.

## Task 9: Final Verification

**Files:**
- All modified files.

- [ ] **Step 1: Run focused tests**

Run:
`bun test apps/electron/src/main/lib/plugin-registry-service.test.ts apps/electron/src/main/lib/agent-expert-group-manager.test.ts apps/electron/src/main/lib/agent-prompt-builder.test.ts apps/electron/src/main/lib/agent-session-manager.test.ts apps/electron/src/renderer/components/settings/settings-tabs.test.tsx`

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`

- [ ] **Step 3: Run app smoke check**

Run: `bun run dev`, open app, verify settings tab and summon entry render. Stop dev server after verification.

- [ ] **Step 4: Commit**

Commit implementation:

```bash
git add packages/shared apps/electron docs/superpowers/plans/2026-06-06-agent-expert-groups.md
git commit -m "feat: add agent expert groups"
```

## Self-Review

- Spec coverage: plan covers plugin-backed discovery, immutable session binding, prompt/runtime merge, IPC/preload, settings UI, summon UI, built-in plugin, and tests.
- Scope control: excludes expert editor, marketplace, import/export, complex permission matrix, independent skill/connector pages, and usage metrics.
- Placeholder scan: no TBD/TODO placeholders are used.
