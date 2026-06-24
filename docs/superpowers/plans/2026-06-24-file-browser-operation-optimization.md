# 工作区文件操作优化 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复多选操作、实现异步并发粘贴+进度反馈、支持工作区文件导出到外部系统。

**Architecture:** 新增 4 个模块（粘贴进度atom、粘贴队列服务、文件导出服务、进度指示器组件），修改 3 个已有文件（FileBrowser、useFileBrowserKeyboard、FileTreeItem），新增 1 个 IPC 通道 + preload 桥接方法。

**Tech Stack:** React, Jotai, Electron IPC, TypeScript

---

## 文件结构

```
packages/shared/src/types/agent.ts          (修改: 新增 WRITE_PATHS_TO_CLIPBOARD)
apps/electron/src/main/ipc.ts               (修改: 新增 IPC handler)
apps/electron/src/preload/index.ts           (修改: 新增 preload 桥接 + 类型)
file-browser/
├── paste-progress-atom.ts                  (新建: 粘贴进度 Jotai atom)
├── file-clipboard-service.ts               (新建: 粘贴队列 + 并发控制)
├── file-export-service.ts                  (新建: 系统剪贴板写入)
├── paste-progress-indicator.tsx             (新建: 粘贴进度 UI 组件)
├── FileBrowser.tsx                         (修改: 集成粘贴进度, 多选删除, 系统剪贴板)
├── useFileBrowserKeyboard.ts               (修改: 新增 onRequestMultiDelete)
├── FileTreeItem.tsx                        (修改: 进度指示器, 导出菜单, 拖出支持)
└── index.ts                                (修改: barrel 导出)
```

---

### Task 1: 添加 IPC 通道常量

**Files:**
- Modify: `packages/shared/src/types/agent.ts`

- [ ] **Step 1: 在 CLEAR_SYSTEM_CLIPBOARD 后添加新通道**

```ts
  /** 将文件路径写入系统剪贴板（CF_HDROP / NSFilenamesPboardType） */
  WRITE_PATHS_TO_SYSTEM_CLIPBOARD: 'agent:write-paths-to-system-clipboard',
```

在 `agent.ts` 的 `CLEAR_SYSTEM_CLIPBOARD` 行（约 2086 行）下方添加。

---

### Task 2: 添加 IPC Handler（主进程）

**Files:**
- Modify: `apps/electron/src/main/ipc.ts`

- [ ] **Step 1: 在 COPY_FILE handler 之后添加新 handler**

在 `AGENT_IPC_CHANNELS.COPY_FILE` handler 的 `});` 之后（约 3689 行）添加：

```ts
  // 将文件路径写入系统剪贴板（支持外部粘贴到资源管理器/Finder）
  ipcMain.handle(
    AGENT_IPC_CHANNELS.WRITE_PATHS_TO_SYSTEM_CLIPBOARD,
    async (_: Electron.IpcMainInvokeEvent, paths: string[]): Promise<void> => {
      const { clipboard, nativeImage } = await import('electron')
      const { resolve } = await import('node:path')

      const validPaths = paths
        .map((p) => resolve(p))
        .filter((p) => {
          try {
            const { statSync } = require('node:fs')
            statSync(p)
            return true
          } catch { return false }
        })

      if (validPaths.length === 0) return

      const isMac = process.platform === 'darwin'

      if (isMac) {
        // macOS: NSFilenamesPboardType
        const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
${validPaths.map((p) => `  <string>file://${p}</string>`).join('\n')}
</array>
</plist>`
        clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(plist, 'utf-8'))
      } else {
        // Windows/Linux: CF_HDROP
        // 格式：DROPFILES 结构 + 双 null 终止的文件路径列表
        const pathBytes: number[] = []
        for (const p of validPaths) {
          for (const char of p + '\0') {
            pathBytes.push(char.charCodeAt(0))
          }
        }
        pathBytes.push(0) // 额外 null 终止

        // DROPFILES 结构（20 字节头）
        const header = Buffer.alloc(20)
        header.writeUInt32LE(20, 0)                  // pFiles = 结构大小
        header.writeUInt32LE(0, 8)                    // pt.x
        header.writeUInt32LE(0, 12)                   // pt.y
        header.writeUInt32LE(0, 16)                   // fNC = FALSE
        header.writeUInt32LE(0, 20)                   // fWide = FALSE

        const full = Buffer.concat([header, Buffer.from(pathBytes)])
        clipboard.writeBuffer('CF_HDROP', full)
      }
    }
  )
```

---

### Task 3: 添加 Preload 桥接 + 类型定义

**Files:**
- Modify: `apps/electron/src/preload/index.ts`

- [ ] **Step 1: 在 preload 实现对象中添加方法**

在 `clearSystemClipboard` 实现之后（约 2458 行）添加：

```ts
  writePathsToSystemClipboard: (paths: string[]) => {
    return ipcRenderer.invoke(AGENT_IPC_CHANNELS.WRITE_PATHS_TO_SYSTEM_CLIPBOARD, paths)
  },
```

- [ ] **Step 2: 在 ElectronAPI 接口中添加类型**

在 `clearSystemClipboard` 类型声明之后添加：

```ts
  /** 将文件路径写入系统剪贴板（支持在外部资源管理器/Finder 中粘贴） */
  writePathsToSystemClipboard: (paths: string[]) => Promise<void>,
```

---

### Task 4: 创建粘贴进度 Atom

**Files:**
- Create: `apps/electron/src/renderer/components/file-browser/paste-progress-atom.ts`

- [ ] **Step 1: 创建文件**

```ts
import { atom } from 'jotai'

export type PasteStatus = 'pending' | 'done' | 'error'

export interface PasteProgressEntry {
  targetPath: string
  status: PasteStatus
  errorMessage?: string
}

/** 粘贴进度 Map：key 为目标路径 */
export const pasteProgressAtom = atom<Map<string, PasteProgressEntry>>(new Map())

/** 添加/更新进度条目 */
export const upsertPasteProgressAtom = atom(
  null,
  (get, set, entry: PasteProgressEntry) => {
    const prev = new Map(get(pasteProgressAtom))
    prev.set(entry.targetPath, entry)
    set(pasteProgressAtom, prev)
  }
)

/** 批量清除指定路径 */
export const removePasteProgressAtom = atom(
  null,
  (get, set, targetPath: string) => {
    const prev = new Map(get(pasteProgressAtom))
    prev.delete(targetPath)
    set(pasteProgressAtom, prev)
  }
)

/** 全量清除 */
export const clearPasteProgressAtom = atom(
  null,
  (_get, set) => set(pasteProgressAtom, new Map())
)
```

---

### Task 5: 创建粘贴队列服务

**Files:**
- Create: `apps/electron/src/renderer/components/file-browser/file-clipboard-service.ts`

- [ ] **Step 1: 创建文件**

```ts
import type { PasteProgressEntry } from './paste-progress-atom'

const MAX_CONCURRENCY = 5

/**
 * 并发粘贴队列，fire-and-forget
 * @param paths 源文件路径列表
 * @param targetDir 目标目录
 * @param mode 操作模式
 * @param onProgress 单文件进度回调
 * @param onComplete 全部完成回调
 */
export async function pastePathsToTarget(
  paths: string[],
  targetDir: string,
  mode: 'copy' | 'cut',
  onProgress: (entry: PasteProgressEntry) => void,
  onComplete: () => void,
): Promise<void> {
  const uniquePaths = Array.from(new Set(paths))
  if (uniquePaths.length === 0) {
    onComplete()
    return
  }

  // 标记所有路径为 pending
  for (const p of uniquePaths) {
    onProgress({ targetPath: p, status: 'pending' })
  }

  // 并发控制：信号量
  let running = 0
  const queue = [...uniquePaths]
  const results: Array<{ path: string; ok: boolean; error?: string }> = []

  const processNext = async (): Promise<void> => {
    if (queue.length === 0) return
    const sourcePath = queue.shift()!
    running++

    try {
      if (mode === 'copy') {
        const destPath = await window.electronAPI.copyFile(sourcePath, targetDir)
        onProgress({ targetPath: destPath, status: 'done' })
        results.push({ path: sourcePath, ok: true })
      } else {
        await window.electronAPI.moveFile(sourcePath, targetDir)
        onProgress({ targetPath: sourcePath, status: 'done' })
        results.push({ path: sourcePath, ok: true })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败'
      console.error(`[ClipboardService] ${mode} 失败: ${sourcePath}`, err)
      onProgress({ targetPath: sourcePath, status: 'error', errorMessage: msg })
      results.push({ path: sourcePath, ok: false, error: msg })
    } finally {
      running--
      await processNext()
    }
  }

  // 启动初始并发
  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length) }, () => processNext())
  await Promise.all(workers)

  onComplete()
}
```

---

### Task 6: 创建文件导出服务

**Files:**
- Create: `apps/electron/src/renderer/components/file-browser/file-export-service.ts`

- [ ] **Step 1: 创建文件**

```ts
/**
 * 将工作区文件路径写入系统剪贴板（通过 IPC 到主进程操作）
 */
export async function writePathsToSystemClipboard(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  try {
    await window.electronAPI.writePathsToSystemClipboard(paths)
  } catch (err) {
    console.error('[ExportService] 写入系统剪贴板失败:', err)
  }
}

/**
 * 打开系统文件夹选择器，将文件复制到用户选择的目标目录
 */
export async function exportPathsToFolder(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const result = await window.electronAPI.openFolderDialog()
  if (!result) return

  const targetDir = result.path
  const total = paths.length
  let copied = 0

  for (const sourcePath of paths) {
    try {
      await window.electronAPI.copyFile(sourcePath, targetDir)
      copied++
    } catch (err) {
      console.error(`[ExportService] 导出失败: ${sourcePath}`, err)
    }
  }

  if (copied > 0) {
    // 打开目标文件夹让用户看到结果
    window.electronAPI.showInFolder(targetDir).catch(() => {})
  }
}
```

---

### Task 7: 创建粘贴进度指示器组件

**Files:**
- Create: `apps/electron/src/renderer/components/file-browser/paste-progress-indicator.tsx`

- [ ] **Step 1: 创建文件**

```tsx
import * as React from 'react'
import { useAtomValue } from 'jotai'
import { pasteProgressAtom, type PasteProgressEntry } from './paste-progress-atom'
import { cn } from '@/lib/utils'

interface PasteProgressIndicatorProps {
  sourcePath: string
}

export function PasteProgressIndicator({ sourcePath }: PasteProgressIndicatorProps): React.ReactElement | null {
  const progressMap = useAtomValue(pasteProgressAtom)
  const entry = progressMap.get(sourcePath)
  const [visible, setVisible] = React.useState(false)
  const [entryData, setEntryData] = React.useState<PasteProgressEntry | null>(null)

  React.useEffect(() => {
    if (!entry) {
      // 保留当前显示短暂时间后淡出
      if (visible) {
        const t = setTimeout(() => setVisible(false), 2000)
        return () => clearTimeout(t)
      }
      return
    }
    setVisible(true)
    setEntryData(entry)
  }, [entry, visible])

  if (!visible || !entryData) return null

  const isPending = entryData.status === 'pending'
  const isDone = entryData.status === 'done'
  const isError = entryData.status === 'error'

  return (
    <span
      className={cn(
        'flex items-center gap-1 flex-shrink-0 text-[10px] animate-in fade-in duration-200',
        isPending && 'text-muted-foreground',
        isDone && 'text-emerald-500',
        isError && 'text-destructive',
      )}
      title={entryData.errorMessage ?? (isDone ? '完成' : '处理中...')}
    >
      {isPending && (
        <>
          <span className="size-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="hidden sm:inline">复制中...</span>
        </>
      )}
      {isDone && (
        <>
          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </>
      )}
      {isError && (
        <>
          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
          <span className="hidden sm:inline">{entryData.errorMessage ?? '失败'}</span>
        </>
      )}
    </span>
  )
}
```

---

### Task 8: 修改 useFileBrowserKeyboard — 新增 onRequestMultiDelete

**Files:**
- Modify: `apps/electron/src/renderer/components/file-browser/useFileBrowserKeyboard.ts`

- [ ] **Step 1: 新增参数接口**

在 `UseFileBrowserKeyboardParams` 接口末尾添加：

```ts
  /** 多选删除触发（Delete键，selectedPaths.size > 0 时调用） */
  onRequestMultiDelete?: () => void
```

- [ ] **Step 2: 从解构中提取新参数，抽取为 ref**

在函数开头解构参数中添加 `onRequestMultiDelete`，并在 ref 声明区添加：

```ts
  const onRequestMultiDeleteRef = React.useRef(onRequestMultiDelete)
  onRequestMultiDeleteRef.current = onRequestMultiDelete
```

- [ ] **Step 3: 修改 Delete 键分支**

将原有 Delete 键分支（约 80-87 行）替换为：

```ts
    if (isDeleteKey && !isMod && selectedPathsRef.current.size > 0) {
      e.preventDefault()
      e.stopPropagation()
      if (selectedPathsRef.current.size > 1) {
        onRequestMultiDeleteRef.current?.()
      } else {
        const firstPath = [...selectedPathsRef.current][0]!
        const meta = metaMapRef.current?.get(firstPath)
        handleRequestDeleteRef.current({
          path: firstPath,
          name: meta?.name ?? firstPath.split(/[/\\]/).pop() ?? '',
          isDirectory: meta?.isDirectory ?? false,
        } as FileEntry)
      }
      return
    }
```

---

### Task 9: 修改 FileBrowser.tsx — 集成所有新功能

**Files:**
- Modify: `apps/electron/src/renderer/components/file-browser/FileBrowser.tsx`

- [ ] **Step 1: 添加新 imports**

在现有 imports 区域（约 53-56 行之间）添加：

```ts
import { pasteProgressAtom, upsertPasteProgressAtom, clearPasteProgressAtom } from './paste-progress-atom'
import { pastePathsToTarget } from './file-clipboard-service'
import { writePathsToSystemClipboard } from './file-export-service'
```

- [ ] **Step 2: 添加 Jotai atom 使用**

在 `const [fileClipboard, setFileClipboard] = useAtom(fileClipboardAtom)` 之后添加：

```ts
  const [, setPasteProgress] = useAtom(upsertPasteProgressAtom)
  const [, clearPasteProgress] = useAtom(clearPasteProgressAtom)
```

- [ ] **Step 3: 修改 copyOrCutToClipboard — 同时写系统剪贴板**

替换现有的 `copyOrCutToClipboard`（约 397 行）：

```ts
  const copyOrCutToClipboard = React.useCallback((mode: 'copy' | 'cut') => {
    if (selectedPaths.size === 0) return
    const paths = [...selectedPaths]
    setFileClipboard({ paths, mode, sourceRoot: rootPath })
    void window.electronAPI.clearSystemClipboard()
    // 同时写入系统剪贴板，支持在外部资源管理器/Finder 中粘贴
    void writePathsToSystemClipboard(paths)
  }, [selectedPaths, rootPath, setFileClipboard])
```

- [ ] **Step 4: 修改 handlePaste — 异步并发粘贴**

替换现有的 `handlePaste` 的 copy 分支（约 380-394 行）：

```ts
  const handlePaste = React.useCallback((clipboard: FileClipboard) => {
    const targetDir = getPasteTargetDir()
    if (clipboard.mode === 'cut') {
      void movePathsToDirectory(clipboard.paths, targetDir)
        .finally(() => setFileClipboard(null))
      return
    }

    // 复制：并发异步，fire-and-forget
    pastePathsToTarget(
      Array.from(new Set(clipboard.paths)),
      targetDir,
      'copy',
      (entry) => setPasteProgress(entry),
      () => {
        clearPasteProgress()
        loadRoot()
        onFilesMoved?.()
      },
    )
  }, [getPasteTargetDir, loadRoot, onFilesMoved, movePathsToDirectory, setFileClipboard, setPasteProgress, clearPasteProgress])
```

- [ ] **Step 5: 添加 handleRequestMultiDelete**

在 `handleRequestDelete` 之后添加：

```ts
  /** 多选删除确认 */
  const handleRequestMultiDelete = React.useCallback(() => {
    if (selectedPaths.size === 0) return
    const firstPath = [...selectedPaths][0]!
    const meta = entryMetaMapRef.current.get(firstPath)
    setDeleteTarget({
      path: firstPath,
      name: meta?.name ?? firstPath.split(/[/\\]/).pop() ?? '',
      isDirectory: meta?.isDirectory ?? false,
    } as FileEntry)
    setDeleteCount(selectedPaths.size)
  }, [selectedPaths])
```

- [ ] **Step 6: 传递 onRequestMultiDelete 给键盘 hook**

修改 `useFileBrowserKeyboard` 调用（约 469 行），追加参数：

```ts
  const handleKeyDown = useFileBrowserKeyboard({
    renamingPath,
    selectedPaths,
    entries,
    entryMetaMapRef,
    copyOrCutToClipboard,
    handleRequestDelete,
    setRenamingPath,
    setSelectedPaths,
    setFileClipboard,
    setKeyboardToggleSignal,
    onSelectedDirectoryChange,
    onFilePreview,
    clearSelection,
    onRequestMultiDelete: handleRequestMultiDelete,
  })
```

- [ ] **Step 7: 在组件卸载时清理粘贴进度**

在已有的 `loadRoot` effect 附近添加：

```ts
  React.useEffect(() => {
    return () => { clearPasteProgress() }
  }, [clearPasteProgress])
```

---

### Task 10: 修改 FileTreeItem.tsx — 进度指示器 + 导出菜单 + 拖出支持

**Files:**
- Modify: `apps/electron/src/renderer/components/file-browser/FileTreeItem.tsx`

- [ ] **Step 1: 添加 imports**

```ts
import { PasteProgressIndicator } from './paste-progress-indicator'
import { FolderUp } from 'lucide-react'
import { exportPathsToFolder } from './file-export-service'
```

`FolderUp` 添加到已有的 `lucide-react` 导入中。

- [ ] **Step 2: 在文件行右侧渲染进度指示器**

在 `FileTypeIcon` 和文件名的 `<span>` 之后，添加进度指示器。找到 `{/* 文件名 / 重命名输入框 */}` 区域（约 740-780 行）末尾，在文件名 `<span>` 之后添加：

```tsx
        {/* 粘贴进度指示器（仅当该路径在进行中时显示） */}
        <PasteProgressIndicator sourcePath={entry.path} />
```

放在 `</ContextMenuTrigger>` 之前。

- [ ] **Step 3: 添加右键菜单"导出到..."**

在"重命名"菜单项之后、"删除"分隔线之前添加（约 630 行）：

```tsx
      {onCreateEntry && menuSelectedCount === 1 && entry.isDirectory && (
        <>
          <ContextMenuSeparator className="my-1" />
          <ContextMenuItem
            className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
            onSelect={() => {
              const paths = selectedPaths.has(entry.path)
                ? Array.from(selectedPaths)
                : [entry.path]
              void exportPathsToFolder(paths)
            }}
          >
            <FolderUp />
            {menuSelectedCount > 1 ? `导出选中 (${menuSelectedCount})` : '导出到...'}
          </ContextMenuItem>
        </>
      )}
```

- [ ] **Step 4: 修改 handleDragStart 支持拖出到外部**

在 `handleDragStart` 末尾（`event.dataTransfer.setData('text/plain', ...)` 之后）添加：

```ts
    // 写入系统剪贴板路径，使外部资源管理器可以接收拖放
    // Electron 通过 file:// URI 列表支持外部拖放
    const fileUris = paths.map((p) => `file:///${p.replace(/\\/g, '/')}`).join('\r\n')
    // Native file drag by adding DownloadURL or files
    event.dataTransfer.setData('text/uri-list', fileUris)
    // 通过系统剪贴板写入路径（间接支持外部拖出）
    void writePathsToSystemClipboard(paths)
```

需要在 imports 中添加 `writePathsToSystemClipboard` 的导入。

- [ ] **Step 5: 添加 imports 中缺少的**

在 FileTreeItem.tsx 顶部已有 imports 中添加：

```ts
import { writePathsToSystemClipboard } from './file-export-service'
```

---

### Task 11: 更新 barrel 导出

**Files:**
- Modify: `apps/electron/src/renderer/components/file-browser/index.ts`

- [ ] **Step 1: 添加新增模块导出**

```ts
export * from './paste-progress-atom'
export * from './file-clipboard-service'
export * from './file-export-service'
export * from './paste-progress-indicator'
```

---

### Task 12: 验证 — TypeScript 编译 + 诊断

- [ ] **Step 1: 运行编译检查**

```bash
node_modules\.bin\tsc --noEmit --project "apps\electron\tsconfig.json" 2>&1 | Select-String "file-browser|paste-progress|file-export|file-clipboard-service"
```

Expected: 所有新文件和修改文件零错误。

- [ ] **Step 2: 检查全部文件诊断**

对以下所有文件逐一运行 `GetDiagnostics`：
- `paste-progress-atom.ts`
- `file-clipboard-service.ts`
- `file-export-service.ts`
- `paste-progress-indicator.tsx`
- `FileBrowser.tsx`
- `useFileBrowserKeyboard.ts`
- `FileTreeItem.tsx`
- `index.ts`

Expected: 全部零诊断。
