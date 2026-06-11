# HTML Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add static HTML preview for Agent-authored `.html/.htm` files, with automatic refresh and wider adjustable right-side preview.

**Architecture:** Reuse the existing Agent preview pipeline. Main process signs an authorized `proma-file://` directory URL, renderer routes `previewKind: 'html'` to an iframe preview, and Agent write events increment a dedicated preview refresh atom.

**Tech Stack:** Electron IPC, React 18, Jotai, Bun test, TypeScript.

---

## File Map

- `packages/shared/src/types/runtime.ts`: Add `HtmlPreviewResult`, `PREPARE_HTML_PREVIEW`, and `previewKind` on detached preview data.
- `apps/electron/src/renderer/atoms/preview-atoms.ts`: Add `PreviewKind` and `previewRefreshVersionAtom`.
- `apps/electron/src/main/ipc.ts`: Add `file:prepare-html-preview` handler using existing path authorization.
- `apps/electron/src/preload/index.ts`: Expose `prepareHtmlPreview`.
- `apps/electron/src/renderer/components/diff/html-preview-utils.ts`: Shared `.html/.htm` detection.
- `apps/electron/src/renderer/components/diff/PreviewContentRouter.tsx`: Route HTML previews to iframe, other files to `DiffTabContent`.
- `apps/electron/src/renderer/components/diff/HtmlPreviewFrame.tsx`: iframe preview with refresh debounce and error state.
- `apps/electron/src/renderer/components/diff/PreviewPanel.tsx`, `PreviewTabContent.tsx`, `DetachedPreviewApp.tsx`: Use router.
- `apps/electron/src/renderer/hooks/useGlobalAgentListeners.ts`: Mark HTML write targets and increment preview refresh version.
- `apps/electron/src/renderer/components/tabs/MainArea.tsx`: Change split drag clamp from fixed ratios to min pixel widths.
- Focused tests beside the modified code.

## Tasks

### Task 1: Types And Utility Tests

- [ ] Write tests for HTML extension detection and preview split clamp source expectations.
- [ ] Run those tests and verify they fail because helpers/behavior are missing.
- [ ] Add shared runtime types and renderer atoms.
- [ ] Implement `html-preview-utils.ts`.
- [ ] Run focused tests and typecheck.

### Task 2: Main/Preload IPC

- [ ] Write tests/source checks for `PREPARE_HTML_PREVIEW`, `registerPromaDirectoryPath`, extension validation, and preload exposure.
- [ ] Run tests and verify they fail.
- [ ] Add IPC handler and preload method.
- [ ] Run focused tests and typecheck.

### Task 3: Renderer HTML Preview

- [ ] Write tests/source checks for `HtmlPreviewFrame` debounce/error behavior and router priority over `previewOnly`.
- [ ] Run tests and verify they fail.
- [ ] Create `HtmlPreviewFrame` and `PreviewContentRouter`.
- [ ] Wire `PreviewPanel`, `PreviewTabContent`, and `DetachedPreviewApp`.
- [ ] Run focused tests and typecheck.

### Task 4: Auto Refresh And Split Width

- [ ] Write tests/source checks for auto HTML preview marking, `previewRefreshVersionAtom` increment, and pixel-based split clamp.
- [ ] Run tests and verify they fail.
- [ ] Update `useGlobalAgentListeners.ts` and `MainArea.tsx`.
- [ ] Run focused tests and typecheck.

### Task 5: Verification

- [ ] Run all focused tests added for this feature.
- [ ] Run `bun run typecheck`.
- [ ] Run relevant existing preview tests.
- [ ] Review git diff against the spec.
