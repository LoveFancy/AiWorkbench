/**
 * FileBrowser — 通用文件浏览器面板
 *
 * 显示指定根路径下的文件树，支持：
 * - 文件夹懒加载展开（Chevron 旋转动画）
 * - 单击选中、Cmd/Ctrl+Click 多选
 * - 悬浮/选中后显示三点菜单（添加到聊天 / 在文件夹中显示 / 重命名 / 移动 / 删除）
 * - 文件/文件夹删除（带确认对话框）
 * - 原位重命名（含同名检查）
 * - 自动刷新
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import {
  RefreshCw,
  ExternalLink,
  FilePlus,
  FolderPlus,
  ClipboardPaste,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { workspaceFilesVersionAtom, fileBrowserAutoRevealAtom, recentlyModifiedPathsAtom, currentAgentSessionIdAtom } from '@/atoms/agent-atoms'
import { fileClipboardAtom, type FileClipboard } from '@/atoms/file-clipboard-atoms'
import type { FileEntry } from '@proma/shared'
import { useFileBrowserKeyboard } from './useFileBrowserKeyboard'
import { formatManagedPath, type ManagedPathRoots } from '@/lib/managed-path-display'
import {
  computeRevealAncestors,
  isPathUnderRoot,
  normalizeFsPath,
  getParentPath,
  isSameOrChildPath,
  filterMovablePaths,
} from './file-path-utils'
import {
  FILE_TREE_DRAG_MIME,
  readFileTreeDragPayload,
  eventHasFileTreeDrag,
  eventHasExternalFiles,
  type FileTreeDragPayload,
} from './file-drag-utils'
import { FileTreeItem } from './FileTreeItem'
import { upsertPasteProgressAtom, clearPasteProgressAtom } from './paste-progress-atom'
import { pastePathsToTarget } from './file-clipboard-service'
import { writePathsToSystemClipboard } from './file-export-service'

export { FILE_TREE_DRAG_MIME, readFileTreeDragPayload, eventHasFileTreeDrag, eventHasExternalFiles }
export type { FileTreeDragPayload }

interface FileBrowserProps {
  rootPath: string
  /** 隐藏内置顶部工具栏（面包屑 + 按钮），由外部自行渲染 */
  hideToolbar?: boolean
  /** 嵌入模式：不使用内部 ScrollArea 和 h-full，由外部容器控制布局和滚动 */
  embedded?: boolean
  /** 隐藏"目录为空"提示（当外部已有附加目录等内容时使用） */
  hideEmpty?: boolean
  /** 托管工作区短路径显示上下文；仅影响展示，不影响真实路径操作 */
  displayRoots?: ManagedPathRoots
  /** 外部空白区点击等场景触发清空当前选中项 */
  clearSelectionSignal?: number
  /** 点击添加到聊天（在文件操作菜单中显示） */
  onAddToChat?: (entry: FileEntry) => void
  /** 单击文件时在内联预览面板中显示（替代外部窗口预览） */
  onFilePreview?: (filePath: string) => void
  /** 当前单选文件夹变化时通知外部；多选、选中文件或清空时传 null */
  onSelectedDirectoryChange?: (dirPath: string | null) => void
  /** 在指定目录下新建文件或文件夹 */
  onCreateEntry?: (parentDir: string, type: 'directory' | 'file') => void
  /** 右键菜单快捷转移到固定目录 */
  transferTarget?: {
    label: string
    targetDir: string | null
  }
  /** 文件通过拖拽或菜单移动成功后通知外部刷新其它文件树 */
  onFilesMoved?: () => void
  /** 外部文件拖到具体目录行时保存到该目录（paths 为同步解析出的磁盘路径，unresolvedFiles 为无法解析路径的文件） */
  onExternalFilesDropToDirectory?: (payload: { paths: string[]; unresolvedFiles: File[] }, targetDir: string) => Promise<void> | void
  /** 从系统剪贴板粘贴外部文件到目标目录（Ctrl/Cmd+V，仅在应用内虚拟剪贴板为空时生效） */
  onExternalFilesPaste?: (payload: { paths: string[]; unresolvedFiles: File[] }, targetDir: string) => Promise<void> | void
  /** 目录行成为拖拽目标时通知外层清理其它 drop target 状态 */
  onDirectoryDropTargetActive?: () => void
}

export function FileBrowser({ rootPath, hideToolbar, embedded, hideEmpty, displayRoots, clearSelectionSignal = 0, onAddToChat, onFilePreview, onSelectedDirectoryChange, onCreateEntry, transferTarget, onFilesMoved, onExternalFilesDropToDirectory, onExternalFilesPaste, onDirectoryDropTargetActive }: FileBrowserProps): React.ReactElement {
  const [entries, setEntries] = React.useState<FileEntry[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const filesVersion = useAtomValue(workspaceFilesVersionAtom)
  const [fileClipboard, setFileClipboard] = useAtom(fileClipboardAtom)
  const [, setPasteProgress] = useAtom(upsertPasteProgressAtom)
  const [, clearPasteProgress] = useAtom(clearPasteProgressAtom)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // ===== Shift+Click 范围选择锚点 =====
  const lastClickedPathRef = React.useRef<string | null>(null)

  // ===== 可见节点元信息追踪（供键盘快捷键使用） =====
  const entryMetaMapRef = React.useRef(new Map<string, { name: string; isDirectory: boolean }>())
  const registerEntryMeta = React.useCallback((entry: FileEntry): (() => void) => {
    entryMetaMapRef.current.set(entry.path, { name: entry.name, isDirectory: entry.isDirectory })
    return () => { entryMetaMapRef.current.delete(entry.path) }
  }, [])

  // ===== 键盘展开/收起信号 =====
  const [keyboardToggleSignal, setKeyboardToggleSignal] = React.useState<{ path: string; ts: number } | null>(null)

  // ===== 剪切路径集合（供 FileTreeItem 视觉反馈使用） =====
  const cutPathsSet = React.useMemo<Set<string>>(
    () => fileClipboard?.mode === 'cut' ? new Set(fileClipboard.paths) : new Set(),
    [fileClipboard],
  )

  // ===== Agent 写入文件时的自动定位 =====
  const autoReveal = useAtomValue(fileBrowserAutoRevealAtom)
  // 仅当目标路径落在本实例 rootPath 内才响应；以 ts 标识本次脉冲
  const revealForThisRoot = React.useMemo(() => {
    if (!autoReveal || !rootPath) return null
    if (!isPathUnderRoot(rootPath, autoReveal.path)) return null
    return autoReveal
  }, [autoReveal, rootPath])
  const revealAncestors = React.useMemo(
    () => revealForThisRoot ? computeRevealAncestors(rootPath, revealForThisRoot.path) : new Set<string>(),
    [revealForThisRoot, rootPath],
  )
  const revealTarget = revealForThisRoot?.path ?? null
  const revealTs = revealForThisRoot?.ts ?? 0
  const revealSelect = revealForThisRoot?.select ?? false

  // ===== autoReveal 带 select 标记时，将目标文件加入选中态 =====
  const consumedSelectTsRef = React.useRef(0)
  React.useEffect(() => {
    if (!revealForThisRoot?.select || !revealTarget) return
    // 避免同一个 ts 被重复消费
    if (revealTs <= consumedSelectTsRef.current) return
    consumedSelectTsRef.current = revealTs
    setSelectedPaths(new Set([revealTarget]))
    lastClickedPathRef.current = revealTarget
    onSelectedDirectoryChange?.(null)
  }, [revealTs, revealForThisRoot?.select, revealTarget, onSelectedDirectoryChange])

  // ===== 最近修改的文件路径（60s 内显示左侧竖条） =====
  const recentlyModifiedMap = useAtomValue(recentlyModifiedPathsAtom)
  const currentSessionId = useAtomValue(currentAgentSessionIdAtom)
  const recentlyModifiedSet = React.useMemo<Set<string>>(() => {
    if (!currentSessionId) return new Set()
    const inner = recentlyModifiedMap.get(currentSessionId)
    if (!inner) return new Set()
    // 仅保留落在本实例 rootPath 下的路径
    const set = new Set<string>()
    for (const p of inner.keys()) {
      if (isPathUnderRoot(rootPath, p)) set.add(p)
    }
    return set
  }, [recentlyModifiedMap, currentSessionId, rootPath])

  // 选中状态
  const [selectedPaths, setSelectedPaths] = React.useState<Set<string>>(new Set())
  // 删除确认状态
  const [deleteTarget, setDeleteTarget] = React.useState<FileEntry | null>(null)
  const [deleteCount, setDeleteCount] = React.useState(1)
  /** 发起删除时的选中路径快照，确保确认时使用正确的路径集合 */
  const deletePathsSnapshotRef = React.useRef<Set<string>>(new Set())
  // 重命名状态
  const [renamingPath, setRenamingPath] = React.useState<string | null>(null)
  // 移动中状态
  const [moving, setMoving] = React.useState(false)

  const selectedCount = selectedPaths.size
  const selectedPathsRef = React.useRef(selectedPaths)
  selectedPathsRef.current = selectedPaths
  const clearSelection = React.useCallback(() => {
    setSelectedPaths(new Set())
    onSelectedDirectoryChange?.(null)
  }, [onSelectedDirectoryChange])

  // 当选中列表清空时自动重置 Shift+Click 锚点
  React.useEffect(() => {
    if (selectedPaths.size === 0) {
      lastClickedPathRef.current = null
    }
  }, [selectedPaths.size])

  React.useEffect(() => {
    if (clearSelectionSignal === 0) return
    clearSelection()
  }, [clearSelectionSignal, clearSelection])

  /** 加载根目录 */
  const loadRoot = React.useCallback(async () => {
    if (!rootPath) return
    entryMetaMapRef.current.clear()
    setLoading(true)
    setError(null)
    try {
      const items = await window.electronAPI.listDirectory(rootPath)
      setEntries(items)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败'
      setError(msg)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [rootPath])

  React.useEffect(() => {
    loadRoot()
  }, [loadRoot, filesVersion])

  /** 选中项 */
  const handleSelect = React.useCallback((entry: FileEntry, event: React.MouseEvent) => {
    containerRef.current?.focus()
    const isShift = event.shiftKey
    const isMulti = event.metaKey || event.ctrlKey

    if (isShift) {
      // Shift+Click: 范围选择
      const anchor = lastClickedPathRef.current
      if (!anchor) {
        // 无锚点，退化为普通点击
        setSelectedPaths(new Set([entry.path]))
        onSelectedDirectoryChange?.(entry.isDirectory ? entry.path : null)
        lastClickedPathRef.current = entry.path
        return
      }
      // 获取可见项的扁平有序列表（entryMetaMapRef 按渲染顺序维护）
      const visiblePaths = [...entryMetaMapRef.current.keys()]
      const anchorIdx = visiblePaths.indexOf(anchor)
      const clickedIdx = visiblePaths.indexOf(entry.path)
      if (anchorIdx === -1 || clickedIdx === -1) {
        // 锚点或点击项不在可见列表中，退化为普通点击
        setSelectedPaths(new Set([entry.path]))
        onSelectedDirectoryChange?.(entry.isDirectory ? entry.path : null)
        lastClickedPathRef.current = entry.path
        return
      }
      const start = Math.min(anchorIdx, clickedIdx)
      const end = Math.max(anchorIdx, clickedIdx)
      const rangePaths = visiblePaths.slice(start, end + 1)
      if (isMulti) {
        // Shift+Ctrl+Click: 合并范围到现有选中
        setSelectedPaths((prev) => {
          const next = new Set(prev)
          for (const p of rangePaths) {
            next.add(p)
          }
          return next
        })
      } else {
        setSelectedPaths(new Set(rangePaths))
      }
      onSelectedDirectoryChange?.(null)
      // 不更新锚点，保持范围选择的起始点
    } else if (isMulti) {
      // Ctrl/Cmd+Click: 切换单个项
      setSelectedPaths((prev) => {
        const next = new Set(prev)
        if (next.has(entry.path)) {
          next.delete(entry.path)
        } else {
          next.add(entry.path)
        }
        return next
      })
      onSelectedDirectoryChange?.(null)
      lastClickedPathRef.current = entry.path
    } else {
      setSelectedPaths(new Set([entry.path]))
      onSelectedDirectoryChange?.(entry.isDirectory ? entry.path : null)
      lastClickedPathRef.current = entry.path
    }
  }, [onSelectedDirectoryChange])

  /** 点击文件行以外的空白区域时清空选中 */
  const handleRootClickCapture = React.useCallback((event: React.MouseEvent) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (target.closest('[data-file-tree-item="true"]')) return
    clearSelection()
  }, [clearSelection])

  /** 在文件夹中显示 */
  const handleShowInFolder = React.useCallback((entry: FileEntry) => {
    window.electronAPI.showInFolder(entry.path).catch(console.error)
  }, [])

  /** 开始重命名 */
  const handleStartRename = React.useCallback((entry: FileEntry) => {
    setRenamingPath(entry.path)
  }, [])

  /** 取消重命名 */
  const handleCancelRename = React.useCallback(() => {
    setRenamingPath(null)
  }, [])

  /** 执行重命名 */
  const handleRename = React.useCallback(async (filePath: string, newName: string): Promise<string | null> => {
    // 同名检查
    const parentDir = filePath.substring(0, filePath.lastIndexOf('/'))
    try {
      const siblings = await window.electronAPI.listDirectory(parentDir)
      const conflict = siblings.some((s) => s.name === newName && s.path !== filePath)
      if (conflict) {
        return '同名文件已存在'
      }
    } catch {
      // 无法列出目录，跳过检查
    }

    try {
      await window.electronAPI.renameFile(filePath, newName)
      await loadRoot()
      setRenamingPath(null)
      setSelectedPaths(new Set())
      lastClickedPathRef.current = null
      return null
    } catch (err) {
      // 完整错误仅记录到控制台；UI 展示通用文案，避免泄露绝对路径等敏感信息
      console.error('[FileBrowser] 重命名失败:', err)
      return '重命名失败'
    }
  }, [loadRoot])

  /** 触发删除（支持多选） */
  const handleRequestDelete = React.useCallback((entry: FileEntry) => {
    deletePathsSnapshotRef.current = new Set(selectedPaths)
    setDeleteTarget(entry)
    setDeleteCount(selectedPaths.size > 1 ? selectedPaths.size : 1)
  }, [selectedPaths])

  /** 多选删除确认（键盘 Delete 键触发） */
  const handleRequestMultiDelete = React.useCallback(() => {
    if (selectedPaths.size === 0) return
    deletePathsSnapshotRef.current = new Set(selectedPaths)
    const firstPath = [...selectedPaths][0]!
    const meta = entryMetaMapRef.current.get(firstPath)
    setDeleteTarget({
      path: firstPath,
      name: meta?.name ?? firstPath.split(/[/\\]/).pop() ?? '',
      isDirectory: meta?.isDirectory ?? false,
    } as FileEntry)
    setDeleteCount(selectedPaths.size)
  }, [selectedPaths])

  /** 执行删除 */
  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget) return
    // 使用请求删除时的选中路径快照，避免期间选中状态变化导致删错文件
    const pathsToDelete = deletePathsSnapshotRef.current
    try {
      if (pathsToDelete.size > 1) {
        for (const path of pathsToDelete) {
          await window.electronAPI.deleteFile(path)
        }
      } else {
        await window.electronAPI.deleteFile(deleteTarget.path)
      }
      setSelectedPaths(new Set())
      lastClickedPathRef.current = null
      await loadRoot()
    } catch (err) {
      console.error('[FileBrowser] 删除失败:', err)
    }
    setDeleteTarget(null)
  }, [deleteTarget, loadRoot])
  const handleMove = React.useCallback(async (entry: FileEntry) => {
    setMoving(true)
    try {
      const result = await window.electronAPI.openFolderDialog()
      if (!result) return

      if (selectedPaths.size > 1) {
        for (const path of selectedPaths) {
          await window.electronAPI.moveFile(path, result.path)
        }
      } else {
        await window.electronAPI.moveFile(entry.path, result.path)
      }
      setSelectedPaths(new Set())
      onFilesMoved?.()
      await loadRoot()
    } catch (err) {
      console.error('[FileBrowser] 移动失败:', err)
    } finally {
      setMoving(false)
    }
  }, [selectedPaths, loadRoot, onFilesMoved])

  const movePathsToDirectory = React.useCallback(async (paths: string[], targetDir: string): Promise<void> => {
    const movablePaths = filterMovablePaths(paths, targetDir)
    if (movablePaths.length === 0) return

    setMoving(true)
    try {
      for (const path of movablePaths) {
        await window.electronAPI.moveFile(path, targetDir)
      }
      setSelectedPaths(new Set())
      onSelectedDirectoryChange?.(null)
      onFilesMoved?.()
      await loadRoot()
    } catch (err) {
      console.error('[FileBrowser] 拖拽移动失败:', err)
    } finally {
      setMoving(false)
    }
  }, [loadRoot, onFilesMoved, onSelectedDirectoryChange])

  const handleTransfer = React.useCallback(async (entry: FileEntry, targetDir: string): Promise<void> => {
    const paths = selectedPaths.has(entry.path) ? Array.from(selectedPaths) : [entry.path]
    await movePathsToDirectory(paths, targetDir)
  }, [movePathsToDirectory, selectedPaths])

  // ===== 键盘粘贴处理 =====
  // 计算粘贴目标目录：单选文件夹→该文件夹；单选文件→其父目录；其它→根目录
  const getPasteTargetDir = React.useCallback((): string => {
    if (selectedPaths.size === 1) {
      const selectedPath = [...selectedPaths][0]!
      const meta = entryMetaMapRef.current.get(selectedPath)
      if (meta?.isDirectory) return selectedPath
      if (meta) return getParentPath(selectedPath)
    }
    return rootPath
  }, [selectedPaths, rootPath])

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

  // ===== 右键菜单复制/剪切/粘贴处理 =====
  const copyOrCutToClipboard = React.useCallback((mode: 'copy' | 'cut') => {
    if (selectedPaths.size === 0) return
    const paths = [...selectedPaths]
    setFileClipboard({ paths, mode, sourceRoot: rootPath })
    void window.electronAPI.clearSystemClipboard()
    // 同时写入系统剪贴板，支持在外部资源管理器/Finder 中粘贴
    void writePathsToSystemClipboard(paths)
  }, [selectedPaths, rootPath, setFileClipboard])

  const handleContextCopy = React.useCallback(() => copyOrCutToClipboard('copy'), [copyOrCutToClipboard])
  const handleContextCut = React.useCallback(() => copyOrCutToClipboard('cut'), [copyOrCutToClipboard])

  const handleContextPaste = React.useCallback(() => {
    if (!fileClipboard) return
    void handlePaste(fileClipboard)
  }, [fileClipboard, handlePaste])

  // ===== 系统剪贴板粘贴处理（同时处理内部和外部剪贴板） =====
  // 以 paste 事件的 clipboardData.files 为准判断来源：
  // - 有 files → 系统剪贴板有文件对象（用户在外部文件管理器复制了文件）→ 外部粘贴
  // - 无 files + 内部剪贴板存在 → 内部 Ctrl+C/X 后的粘贴
  // 内部 Ctrl+C/X 会调用 clearSystemClipboard() 清除系统剪贴板残留，
  // 确保 paste 事件的 clipboardData.files 不会干扰内部粘贴。
  const handlePasteEvent = React.useCallback((e: ClipboardEvent): void => {
    if (renamingPath) return
    const container = containerRef.current
    if (!container || !container.contains(document.activeElement)) return

    const systemFiles = Array.from(e.clipboardData?.files ?? [])

    if (systemFiles.length > 0) {
      // 系统剪贴板有文件对象 → 外部文件管理器复制 → 优先使用系统剪贴板
      // 同时清除可能存在的内部剪贴板（已过期）
      if (fileClipboard) {
        setFileClipboard(null)
      }

      if (!onExternalFilesPaste) return

      // 必须在事件同步执行期内调用 getPathForFile
      const paths: string[] = []
      const unresolvedFiles: File[] = []
      for (const file of systemFiles) {
        let path: string | null = null
        try { path = window.electronAPI.getPathForFile(file) } catch { path = null }
        if (path) paths.push(path)
        else unresolvedFiles.push(file)
      }
      if (paths.length === 0 && unresolvedFiles.length === 0) return

      e.preventDefault()
      e.stopPropagation()
      void onExternalFilesPaste({ paths, unresolvedFiles }, getPasteTargetDir())
      return
    }

    // 系统剪贴板无文件对象 → 检查内部剪贴板
    if (fileClipboard) {
      e.preventDefault()
      e.stopPropagation()
      void handlePaste(fileClipboard)
      return
    }
  }, [fileClipboard, renamingPath, onExternalFilesPaste, handlePaste, getPasteTargetDir, setFileClipboard])

  React.useEffect(() => {
    document.addEventListener('paste', handlePasteEvent, true)
    return () => document.removeEventListener('paste', handlePasteEvent, true)
  }, [handlePasteEvent])

  // 组件卸载时清理粘贴进度
  React.useEffect(() => {
    return () => { clearPasteProgress() }
  }, [clearPasteProgress])

  // ===== 键盘快捷键处理 =====
  const handleKeyDown = useFileBrowserKeyboard({
    renamingPath,
    selectedPaths,
    entries,
    entryMetaMapRef,
    lastClickedPathRef,
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

  const handleRootDragOver = React.useCallback((event: React.DragEvent): void => {
    if (!eventHasFileTreeDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const handleRootDrop = React.useCallback((event: React.DragEvent): void => {
    const payload = readFileTreeDragPayload(event)
    if (!payload) return
    event.preventDefault()
    event.stopPropagation()
    void movePathsToDirectory(payload.paths, rootPath)
  }, [movePathsToDirectory, rootPath])

  const breadcrumb = React.useMemo(() => {
    if (displayRoots) return formatManagedPath(rootPath, displayRoots)
    const parts = rootPath.split('/').filter(Boolean)
    return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : rootPath
  }, [displayRoots, rootPath])

  const fileTree = (
    <div className="py-1">
      {error && (
        <div className="px-3 py-2 text-xs text-destructive">{error}</div>
      )}
      {!error && entries.length === 0 && !loading && !hideEmpty && (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
          目录为空
        </div>
      )}
      {entries.map((entry) => (
        <FileTreeItem
          key={entry.path}
          entry={entry}
          depth={0}
          selectedPaths={selectedPaths}
          selectedCount={selectedCount}
          renamingPath={renamingPath}
          moving={moving}
          refreshVersion={filesVersion}
          revealAncestors={revealAncestors}
          revealTarget={revealTarget}
          revealTs={revealTs}
          revealSelect={revealSelect}
          recentlyModifiedSet={recentlyModifiedSet}
          registerEntryMeta={registerEntryMeta}
          keyboardToggleSignal={keyboardToggleSignal}
          cutPathsSet={cutPathsSet}
          onSelect={handleSelect}
          onShowInFolder={handleShowInFolder}
          onStartRename={handleStartRename}
          onCancelRename={handleCancelRename}
          onRename={handleRename}
          onDelete={handleRequestDelete}
          onMultiDelete={handleRequestMultiDelete}
          onMove={handleMove}
          onRefresh={loadRoot}
          onClearSelection={clearSelection}
          onAddToChat={onAddToChat}
          onFilePreview={onFilePreview}
          onCreateEntry={onCreateEntry}
          transferTarget={transferTarget}
          onTransfer={handleTransfer}
          onMovePathsToDirectory={movePathsToDirectory}
          onExternalFilesDropToDirectory={onExternalFilesDropToDirectory}
          onDirectoryDropTargetActive={onDirectoryDropTargetActive}
          onCopySelection={handleContextCopy}
          onCutSelection={handleContextCut}
          onPasteFromClipboard={handleContextPaste}
          hasClipboardContent={fileClipboard !== null}
        />
      ))}
      {/* 底部留白，确保文件条目下方始终有足够空间右键触发根目录菜单 */}
      <div className="h-8" />
    </div>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn(
        'flex flex-col outline-none transition-colors',
        embedded ? 'min-h-0' : 'h-full',
        // 剪贴板有内容且无选中项时，根目录就是粘贴目标，显示虚线边框提示
        fileClipboard && selectedPaths.size === 0 && 'ring-1 ring-dashed ring-primary/40 rounded-md',
      )}
      onKeyDown={handleKeyDown}
      onClickCapture={handleRootClickCapture}
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
    >
      {/* 顶部工具栏（可由外部接管） */}
      {!hideToolbar && (
        <div className="flex items-center gap-1 px-3 pr-10 h-[48px] border-b flex-shrink-0">
          <span className="text-xs text-muted-foreground truncate flex-1" title={rootPath}>
            {breadcrumb}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={() => window.electronAPI.openFile(rootPath).catch(console.error)}
            title="在 Finder 中打开"
          >
            <ExternalLink className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={loadRoot}
            disabled={loading}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      )}

      {/* 文件树 */}
      {embedded ? fileTree : (
        <ScrollArea className="flex-1">
          {fileTree}
        </ScrollArea>
      )}

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCount > 1 ? (
                <>确定要删除选中的 <strong>{deleteCount}</strong> 个项目吗？</>
              ) : (
                <>
                  确定要删除 <strong>{deleteTarget?.name}</strong> 吗？
                  {deleteTarget?.isDirectory && '（包含所有子文件）'}
                </>
              )}
              此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
      </ContextMenuTrigger>
      {/* 根目录空白区域右键菜单 */}
      <ContextMenuContent className="z-[9999] min-w-[160px]">
        {onCreateEntry && (
          <>
            <ContextMenuItem
              className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
              onSelect={() => onCreateEntry(rootPath, 'file')}
            >
              <FilePlus />
              新建文件
            </ContextMenuItem>
            <ContextMenuItem
              className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
              onSelect={() => onCreateEntry(rootPath, 'directory')}
            >
              <FolderPlus />
              新建文件夹
            </ContextMenuItem>
            <ContextMenuSeparator className="my-1" />
          </>
        )}
        {fileClipboard && (
          <ContextMenuItem
            className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
            onSelect={() => void handleContextPaste()}
          >
            <ClipboardPaste />
            粘贴到根目录
            <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+V</span>
          </ContextMenuItem>
        )}
        {!fileClipboard && (
          <div className="px-2 py-1.5 text-[12px] text-muted-foreground">
            复制文件后可使用 Ctrl+V 粘贴到根目录
          </div>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}