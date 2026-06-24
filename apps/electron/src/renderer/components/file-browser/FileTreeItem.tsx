/**
 * FileTreeItem — 文件树单行组件
 *
 * 从 FileBrowser.tsx 抽取，负责单行文件/文件夹的渲染、展开/收起、
 * 选中、拖拽、右键菜单、原位重命名、键盘 Enter 信号响应等交互。
 * 通过 children.map 递归渲染子项实现深层文件树。
 */

import * as React from 'react'
import {
  ChevronRight,
  Trash2,
  FolderSearch,
  FolderInput,
  FolderUp,
  Pencil,
  MessageSquarePlus,
  FilePlus,
  FolderPlus,
  MonitorPlay,
  Copy,
  Scissors,
  ClipboardPaste,
} from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import type { FileEntry } from '@proma/shared'
import { FileTypeIcon } from './FileTypeIcon'
import { DefaultAppMenuItem } from './DefaultAppMenuItem'
import { isHtmlPreviewPath } from '@/components/diff/html-preview-utils'
import {
  computeTreeRowLayout,
  AncestorGuides,
  STICKY_ROW_BASE_CLASS,
  canBeSticky,
} from './tree-row-layout'
import {
  normalizeFsPath,
  getParentPath,
  isSameOrChildPath,
} from './file-path-utils'
import {
  FILE_TREE_DRAG_MIME,
  readFileTreeDragPayload,
  eventHasFileTreeDrag,
  eventHasExternalFiles,
  isPointerInsideElement,
} from './file-drag-utils'
import { PasteProgressIndicator } from './paste-progress-indicator'
import { exportPathsToFolder, writePathsToSystemClipboard } from './file-export-service'

// ===== FileTreeItem 子组件 =====

export interface FileTreeItemProps {
  entry: FileEntry
  depth: number
  selectedPaths: Set<string>
  selectedCount: number
  renamingPath: string | null
  moving: boolean
  /** 文件版本号，变化时已展开的文件夹自动重新加载子项 */
  refreshVersion: number
  /** 自动定位：祖先目录路径集合（命中则自动展开） */
  revealAncestors: Set<string>
  /** 自动定位：目标文件路径（命中则滚动 + 高亮脉冲） */
  revealTarget: string | null
  /** 自动定位脉冲时间戳，变化时重新触发 */
  revealTs: number
  /** 本次 reveal 是否带 select 标记（来源于用户搜索点击）；为 true 时跳过 flash 高亮，避免覆盖选中色 */
  revealSelect: boolean
  /** 最近修改的路径集合（命中则在行左侧显示竖条标记） */
  recentlyModifiedSet: Set<string>
  registerEntryMeta: (entry: FileEntry) => () => void
  keyboardToggleSignal: { path: string; ts: number } | null
  cutPathsSet: Set<string>
  onSelect: (entry: FileEntry, event: React.MouseEvent) => void
  onShowInFolder: (entry: FileEntry) => void
  onStartRename: (entry: FileEntry) => void
  onCancelRename: () => void
  onRename: (filePath: string, newName: string) => Promise<string | null>
  onDelete: (entry: FileEntry) => void
  onMove: (entry: FileEntry) => void
  onRefresh: () => Promise<void>
  onClearSelection: () => void
  onAddToChat?: (entry: FileEntry) => void
  onFilePreview?: (filePath: string) => void
  onCreateEntry?: (parentDir: string, type: 'directory' | 'file') => void
  transferTarget?: {
    label: string
    targetDir: string | null
  }
  onTransfer: (entry: FileEntry, targetDir: string) => Promise<void>
  onMovePathsToDirectory: (paths: string[], targetDir: string) => Promise<void>
  onExternalFilesDropToDirectory?: (payload: { paths: string[]; unresolvedFiles: File[] }, targetDir: string) => Promise<void> | void
  onDirectoryDropTargetActive?: () => void
  /** 复制选中项到内部剪贴板 */
  onCopySelection: () => void
  /** 剪切选中项到内部剪贴板 */
  onCutSelection: () => void
  /** 粘贴内部剪贴板到目标目录 */
  onPasteFromClipboard: () => void
  /** 内部文件剪贴板是否有内容（用于控制粘贴菜单项可用性） */
  hasClipboardContent: boolean
}

export function FileTreeItem({
  entry,
  depth,
  selectedPaths,
  selectedCount,
  renamingPath,
  moving,
  refreshVersion,
  revealAncestors,
  revealTarget,
  revealTs,
  revealSelect,
  recentlyModifiedSet,
  registerEntryMeta,
  keyboardToggleSignal,
  cutPathsSet,
  onSelect,
  onShowInFolder,
  onStartRename,
  onCancelRename,
  onRename,
  onDelete,
  onMove,
  onRefresh,
  onClearSelection,
  onAddToChat,
  onFilePreview,
  onCreateEntry,
  transferTarget,
  onTransfer,
  onMovePathsToDirectory,
  onExternalFilesDropToDirectory,
  onDirectoryDropTargetActive,
  onCopySelection,
  onCutSelection,
  onPasteFromClipboard,
  hasClipboardContent,
}: FileTreeItemProps): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const [children, setChildren] = React.useState<FileEntry[]>([])
  const [childrenLoaded, setChildrenLoaded] = React.useState(false)
  const [flash, setFlash] = React.useState(false)
  const [isDropTarget, setIsDropTarget] = React.useState(false)
  const rowRef = React.useRef<HTMLDivElement>(null)
  const dropExpandTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoExpandedByDragRef = React.useRef(false)
  const autoCollapseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearDropExpandTimer = React.useCallback((): void => {
    if (!dropExpandTimerRef.current) return
    clearTimeout(dropExpandTimerRef.current)
    dropExpandTimerRef.current = null
  }, [])

  const clearAutoCollapseTimer = React.useCallback((): void => {
    if (!autoCollapseTimerRef.current) return
    clearTimeout(autoCollapseTimerRef.current)
    autoCollapseTimerRef.current = null
  }, [])

  const scheduleAutoCollapse = React.useCallback((): void => {
    if (!autoExpandedByDragRef.current) return
    clearAutoCollapseTimer()
    autoCollapseTimerRef.current = setTimeout(() => {
      autoCollapseTimerRef.current = null
      if (!autoExpandedByDragRef.current) return
      setExpanded(false)
      autoExpandedByDragRef.current = false
    }, 320)
  }, [clearAutoCollapseTimer])

  React.useEffect(() => () => {
    clearDropExpandTimer()
    clearAutoCollapseTimer()
  }, [clearDropExpandTimer, clearAutoCollapseTimer])

  // 注册元数据到父组件的 entryMetaMapRef
  React.useEffect(() => {
    return registerEntryMeta(entry)
  }, [entry, registerEntryMeta])

  // 响应键盘 Enter 信号（展开/收起目录）
  React.useEffect(() => {
    if (!keyboardToggleSignal) return
    if (keyboardToggleSignal.path !== entry.path) return
    if (!entry.isDirectory) return
    setExpanded((prev) => !prev)
  }, [keyboardToggleSignal, entry.path, entry.isDirectory])

  // 当 refreshVersion 变化时，已展开的文件夹自动重新加载子项
  React.useEffect(() => {
    if (expanded && childrenLoaded && entry.isDirectory) {
      window.electronAPI.listDirectory(entry.path)
        .then((items) => setChildren(items))
        .catch((err) => console.error('[FileTreeItem] 刷新子目录失败:', err))
    }
  }, [refreshVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== Agent 自动定位：祖先目录自动展开 + 目标行滚动到中心 + 0.8s 高亮脉冲 =====
  React.useEffect(() => {
    if (revealTs === 0) return

    const cleanups: Array<() => void> = []
    const isAncestor = revealAncestors.has(entry.path)
    const isTarget = revealTarget !== null && entry.path === revealTarget

    const scrollToTarget = (): void => {
      requestAnimationFrame(() => {
        rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }

    const willExpand = entry.isDirectory && (isAncestor || isTarget) && !expanded
    if (willExpand) {
      let cancelled = false
      const run = async (): Promise<void> => {
        if (!childrenLoaded) {
          try {
            const items = await window.electronAPI.listDirectory(entry.path)
            if (!cancelled) {
              setChildren(items)
              setChildrenLoaded(true)
            }
          } catch (err) {
            console.error('[FileTreeItem] reveal 加载子目录失败:', err)
            return
          }
        }
        if (cancelled) return
        setExpanded(true)
        if (isTarget) scrollToTarget()
      }
      void run()
      cleanups.push(() => { cancelled = true })
    }

    if (isTarget) {
      if (!willExpand) scrollToTarget()
      if (!revealSelect) {
        setFlash(true)
        const t = setTimeout(() => setFlash(false), 1200)
        cleanups.push(() => clearTimeout(t))
      }
    }

    if (cleanups.length > 0) return () => { for (const c of cleanups) c() }
  }, [revealTs]) // eslint-disable-line react-hooks/exhaustive-deps

  // 重命名编辑状态
  const [editName, setEditName] = React.useState('')
  const [renameError, setRenameError] = React.useState<string | null>(null)
  const renameInputRef = React.useRef<HTMLInputElement>(null)
  const justStartedEditing = React.useRef(false)

  const isSelected = selectedPaths.has(entry.path)
  const isRenaming = renamingPath === entry.path
  const isCutTarget = cutPathsSet.has(entry.path)

  const loadChildren = async (): Promise<FileEntry[]> => {
    const items = await window.electronAPI.listDirectory(entry.path)
    setChildren(items)
    setChildrenLoaded(true)

    if (items.length === 0) {
      setTimeout(async () => {
        try {
          const retryItems = await window.electronAPI.listDirectory(entry.path)
          if (retryItems.length > 0) setChildren(retryItems)
        } catch { /* 静默忽略 */ }
      }, 800)
    }

    return items
  }

  const expandDir = async (): Promise<void> => {
    if (!entry.isDirectory) return
    if (!childrenLoaded) {
      try {
        await loadChildren()
      } catch (err) {
        console.error('[FileTreeItem] 加载子目录失败:', err)
        return
      }
    }
    setExpanded(true)
  }

  const toggleDir = async (): Promise<void> => {
    if (!entry.isDirectory) return

    if (!expanded && !childrenLoaded) {
      try {
        await loadChildren()
      } catch (err) {
        console.error('[FileTreeItem] 加载子目录失败:', err)
      }
    }

    setExpanded(!expanded)
  }

  const handleClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    const isMulti = e.metaKey || e.ctrlKey
    onSelect(entry, e)
    if (isMulti) return
    if (entry.isDirectory) {
      void toggleDir()
    } else {
      onFilePreview?.(entry.path)
    }
  }

  const handleDragStart = (event: React.DragEvent): void => {
    if (isRenaming) {
      event.preventDefault()
      return
    }
    const paths = isSelected ? Array.from(selectedPaths) : [entry.path]
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(FILE_TREE_DRAG_MIME, JSON.stringify({ paths }))
    event.dataTransfer.setData('text/plain', paths.join('\n'))
    // 支持拖出到外部资源管理器
    const fileUris = paths.map((p) => `file:///${p.replace(/\\/g, '/')}`).join('\r\n')
    event.dataTransfer.setData('text/uri-list', fileUris)
    void writePathsToSystemClipboard(paths)
  }

  const handleDragEnd = (): void => {
    clearDropExpandTimer()
    clearAutoCollapseTimer()
    autoExpandedByDragRef.current = false
    setIsDropTarget(false)
  }

  const handleDragOver = (event: React.DragEvent): void => {
    if (!entry.isDirectory) return
    if (!eventHasFileTreeDrag(event) && eventHasExternalFiles(event) && onExternalFilesDropToDirectory) {
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'copy'
      onDirectoryDropTargetActive?.()
      setIsDropTarget(true)
      clearAutoCollapseTimer()
      if (!expanded && !dropExpandTimerRef.current) {
        dropExpandTimerRef.current = setTimeout(() => {
          dropExpandTimerRef.current = null
          autoExpandedByDragRef.current = true
          void expandDir()
        }, 450)
      }
      return
    }
    if (!eventHasFileTreeDrag(event)) return
    const payload = readFileTreeDragPayload(event)
    if (!payload) return
    const canDrop = payload.paths.some((path) => {
      if (normalizeFsPath(getParentPath(path)) === normalizeFsPath(entry.path)) return false
      return !isSameOrChildPath(path, entry.path)
    })
    if (!canDrop) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    onDirectoryDropTargetActive?.()
    setIsDropTarget(true)
    clearAutoCollapseTimer()
    if (!expanded && !dropExpandTimerRef.current) {
      dropExpandTimerRef.current = setTimeout(() => {
        dropExpandTimerRef.current = null
        autoExpandedByDragRef.current = true
        void expandDir()
      }, 450)
    }
  }

  const handleDragLeave = (event: React.DragEvent): void => {
    const related = event.relatedTarget as Node | null
    if (related && rowRef.current?.contains(related)) return
    if (!related && isPointerInsideElement(event, rowRef.current)) return
    clearDropExpandTimer()
    setIsDropTarget(false)
    scheduleAutoCollapse()
  }

  const handleDrop = (event: React.DragEvent): void => {
    if (!entry.isDirectory) return
    if (!eventHasFileTreeDrag(event) && event.dataTransfer.files.length > 0 && onExternalFilesDropToDirectory) {
      event.preventDefault()
      event.stopPropagation()
      clearDropExpandTimer()
      clearAutoCollapseTimer()
      setIsDropTarget(false)
      autoExpandedByDragRef.current = false
      const droppedFiles = Array.from(event.dataTransfer.files)
      const paths: string[] = []
      const unresolvedFiles: File[] = []
      for (const file of droppedFiles) {
        let path: string | null = null
        try { path = window.electronAPI.getPathForFile(file) } catch { path = null }
        if (path) paths.push(path)
        else unresolvedFiles.push(file)
      }
      void (async () => {
        await expandDir()
        await onExternalFilesDropToDirectory({ paths, unresolvedFiles }, entry.path)
        try {
          const items = await window.electronAPI.listDirectory(entry.path)
          setChildren(items)
          setChildrenLoaded(true)
        } catch (err) {
          console.error('[FileTreeItem] 外部文件保存后刷新目录失败:', err)
        }
      })()
      return
    }
    const payload = readFileTreeDragPayload(event)
    if (!payload) return
    event.preventDefault()
    event.stopPropagation()
    clearDropExpandTimer()
    clearAutoCollapseTimer()
    setIsDropTarget(false)
    autoExpandedByDragRef.current = false
    void (async () => {
      await expandDir()
      await onMovePathsToDirectory(payload.paths, entry.path)
      try {
        const items = await window.electronAPI.listDirectory(entry.path)
        setChildren(items)
        setChildrenLoaded(true)
      } catch (err) {
        console.error('[FileTreeItem] 拖拽移动后刷新目录失败:', err)
      }
    })()
  }

  const handleRefreshAfterDelete = async (): Promise<void> => {
    if (childrenLoaded) {
      try {
        const items = await window.electronAPI.listDirectory(entry.path)
        setChildren(items)
      } catch {
        await onRefresh()
      }
    }
  }

  React.useEffect(() => {
    if (isRenaming) {
      setEditName(entry.name)
      setRenameError(null)
      justStartedEditing.current = true
      const timer = setTimeout(() => {
        justStartedEditing.current = false
        const input = renameInputRef.current
        if (input) {
          input.focus()
          const lastDotIndex = entry.name.lastIndexOf('.')
          if (lastDotIndex > 0 && !entry.isDirectory) {
            input.setSelectionRange(0, lastDotIndex)
          } else {
            input.select()
          }
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isRenaming, entry.name, entry.isDirectory])

  const saveRename = async (): Promise<void> => {
    if (justStartedEditing.current) return

    const trimmed = editName.trim()
    if (!trimmed || trimmed === entry.name) {
      onCancelRename()
      return
    }
    const error = await onRename(entry.path, trimmed)
    if (error) {
      setRenameError(error)
    }
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void saveRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancelRename()
    }
  }

  const handleBlur = (): void => {
    if (renameError) {
      onCancelRename()
      setRenameError(null)
    } else {
      void saveRename()
    }
  }

  const handleWrapperClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) {
      onClearSelection()
    }
  }

  const { paddingLeft, guideLeft, stickyTop, stickyZIndex } = computeTreeRowLayout(depth)
  const isSticky = entry.isDirectory && expanded && canBeSticky(depth)
  const showMenu = !isRenaming
  const menuSelectedCount = isSelected ? selectedCount : 1
  const menuItems = (): React.ReactNode => (
    <>
      {onCreateEntry && menuSelectedCount === 1 && entry.isDirectory && (
        <>
          <ContextMenuItem
            className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
            onSelect={() => onCreateEntry(entry.path, 'file')}
          >
            <FilePlus />
            新建文件
          </ContextMenuItem>
          <ContextMenuItem
            className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
            onSelect={() => onCreateEntry(entry.path, 'directory')}
          >
            <FolderPlus />
            新建文件夹
          </ContextMenuItem>
          <ContextMenuSeparator className="my-1" />
        </>
      )}
      {onAddToChat && !entry.isDirectory && menuSelectedCount === 1 && (
        <ContextMenuItem
          className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
          onSelect={() => onAddToChat(entry)}
        >
          <MessageSquarePlus />
          添加到聊天
        </ContextMenuItem>
      )}
      {onFilePreview && !entry.isDirectory && menuSelectedCount === 1 && isHtmlPreviewPath(entry.path) && (
        <ContextMenuItem
          className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
          onSelect={() => onFilePreview?.(entry.path)}
        >
          <MonitorPlay />
          实时预览
        </ContextMenuItem>
      )}
      {menuSelectedCount === 1 && (
        <ContextMenuItem
          className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
          onSelect={() => onShowInFolder(entry)}
        >
          <FolderSearch />
          在文件夹中显示
        </ContextMenuItem>
      )}
      {menuSelectedCount === 1 && !entry.isDirectory && (
        <DefaultAppMenuItem
          filePath={entry.path}
          menuKind="context"
          className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
        />
      )}
      {/* 复制 / 剪切 / 粘贴 */}
      <ContextMenuSeparator className="my-1" />
      {onCopySelection && (
        <ContextMenuItem
          className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
          onSelect={() => onCopySelection()}
        >
          <Copy />
          复制
          <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+C</span>
        </ContextMenuItem>
      )}
      {onCutSelection && (
        <ContextMenuItem
          className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
          onSelect={() => onCutSelection()}
        >
          <Scissors />
          剪切
          <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+X</span>
        </ContextMenuItem>
      )}
      {onPasteFromClipboard && (
        <ContextMenuItem
          className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
          disabled={!hasClipboardContent}
          onSelect={() => onPasteFromClipboard()}
        >
          <ClipboardPaste />
          粘贴
          <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+V</span>
        </ContextMenuItem>
      )}
      <ContextMenuSeparator className="my-1" />
      <ContextMenuItem
        className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
        disabled={moving}
        onSelect={() => { void onMove(entry) }}
      >
        <FolderInput />
        {menuSelectedCount > 1 ? `移动选中 (${menuSelectedCount})` : '移动到...'}
      </ContextMenuItem>
      {transferTarget && (
        <ContextMenuItem
          className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
          disabled={moving || !transferTarget.targetDir}
          onSelect={() => {
            if (!transferTarget.targetDir) return
            void onTransfer(entry, transferTarget.targetDir)
          }}
        >
          <FolderInput />
          {menuSelectedCount > 1 ? `${transferTarget.label} (${menuSelectedCount})` : transferTarget.label}
        </ContextMenuItem>
      )}
      {menuSelectedCount === 1 && (
        <ContextMenuItem
          className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
          onSelect={() => onStartRename(entry)}
        >
          <Pencil />
          重命名
        </ContextMenuItem>
      )}
      {/* 导出到外部文件夹 */}
      {onCreateEntry && (
        <>
          <ContextMenuSeparator className="my-1" />
          <ContextMenuItem
            className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
            onSelect={() => {
              const paths = isSelected ? Array.from(selectedPaths) : [entry.path]
              void exportPathsToFolder(paths)
            }}
          >
            <FolderUp />
            {menuSelectedCount > 1 ? `导出选中 (${menuSelectedCount})` : '导出到...'}
          </ContextMenuItem>
        </>
      )}
      <ContextMenuSeparator className="my-1" />
      <ContextMenuItem
        className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4 text-destructive"
        onSelect={() => onDelete(entry)}
      >
        <Trash2 />
        {menuSelectedCount > 1 ? `删除选中 (${menuSelectedCount})` : '删除'}
      </ContextMenuItem>
    </>
  )

  return (
    <div className="relative" onClick={handleWrapperClick}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={rowRef}
            data-file-tree-item="true"
            data-sticky-row={isSticky ? 'true' : undefined}
            className={cn(
              'relative flex h-8 items-center gap-1 pr-2 text-sm cursor-pointer group transition-colors border-l-[3px] border-transparent',
              isSticky && STICKY_ROW_BASE_CLASS,
              isSelected
                ? 'bg-primary/10 border-l-primary'
                : isSticky
                  ? 'hover:bg-accent'
                  : 'hover:bg-accent/50',
              flash && 'file-browser-row-flash',
              isCutTarget && 'opacity-50',
              isDropTarget && 'bg-primary/15 text-foreground shadow-sm ring-2 ring-primary/60 ring-inset',
            )}
            style={{
              paddingLeft,
              top: isSticky ? stickyTop : undefined,
              zIndex: isSticky ? stickyZIndex : undefined,
            }}
            onClick={handleClick}
            draggable={!isRenaming}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onContextMenu={(event) => {
              if (!isSelected) onSelect(entry, event)
            }}
          >
            {isDropTarget && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 right-0 bg-primary/10"
              />
            )}
            {isSticky && <AncestorGuides depth={depth} isSelected={isSelected} />}
            {recentlyModifiedSet.has(entry.path) && (
              <span
                aria-label="最近被 Agent 修改"
                className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary/80"
                style={{ left: paddingLeft - 6 }}
              />
            )}
            {entry.isDirectory ? (
              <ChevronRight
                className={cn(
                  'size-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-150',
                  expanded && 'rotate-90',
                )}
              />
            ) : (
              <span className="w-3.5 flex-shrink-0" />
            )}

            <FileTypeIcon name={entry.name} isDirectory={entry.isDirectory} isOpen={expanded} />

            {isRenaming ? (
              <div className="relative flex-1 min-w-0">
                <input
                  ref={renameInputRef}
                  value={editName}
                  onChange={(e) => { setEditName(e.target.value); setRenameError(null) }}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={handleBlur}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    'w-full bg-transparent text-xs border-b outline-none py-0.5',
                    renameError ? 'border-destructive' : 'border-primary/50',
                  )}
                  maxLength={255}
                />
                {renameError && (
                  <div className="absolute left-0 top-full mt-0.5 text-[10px] leading-4 text-destructive whitespace-nowrap pointer-events-none">
                    {renameError}
                  </div>
                )}
              </div>
            ) : (
              <span className="truncate text-xs flex-1">{entry.name}</span>
            )}

            {/* 粘贴进度指示器 */}
            <PasteProgressIndicator sourcePath={entry.path} />

          </div>
        </ContextMenuTrigger>
        {showMenu && (
          <ContextMenuContent className="w-48 z-[9999] min-w-0 p-1.5">
            {menuItems()}
          </ContextMenuContent>
        )}
      </ContextMenu>

      {expanded && (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1 top-0 w-px bg-border/70"
            style={{ left: guideLeft }}
          />
          {children.length === 0 && childrenLoaded && (
            <div
              className="text-[11px] text-muted-foreground/50 py-1"
              style={{ paddingLeft: paddingLeft + 24 }}
            >
              空文件夹
            </div>
          )}
          {children.map((child) => (
            <FileTreeItem
              key={child.path}
              entry={child}
              depth={depth + 1}
              selectedPaths={selectedPaths}
              selectedCount={selectedCount}
              renamingPath={renamingPath}
              moving={moving}
              refreshVersion={refreshVersion}
              revealAncestors={revealAncestors}
              revealTarget={revealTarget}
              revealTs={revealTs}
              revealSelect={revealSelect}
              recentlyModifiedSet={recentlyModifiedSet}
              registerEntryMeta={registerEntryMeta}
              keyboardToggleSignal={keyboardToggleSignal}
              cutPathsSet={cutPathsSet}
              onSelect={onSelect}
              onShowInFolder={onShowInFolder}
              onStartRename={onStartRename}
              onCancelRename={onCancelRename}
              onRename={onRename}
              onDelete={onDelete}
              onMove={onMove}
              onRefresh={handleRefreshAfterDelete}
              onClearSelection={onClearSelection}
              onAddToChat={onAddToChat}
              onFilePreview={onFilePreview}
              onCreateEntry={onCreateEntry}
              transferTarget={transferTarget}
              onTransfer={onTransfer}
              onMovePathsToDirectory={onMovePathsToDirectory}
              onExternalFilesDropToDirectory={onExternalFilesDropToDirectory}
              onDirectoryDropTargetActive={onDirectoryDropTargetActive}
              onCopySelection={onCopySelection}
              onCutSelection={onCutSelection}
              onPasteFromClipboard={onPasteFromClipboard}
              hasClipboardContent={hasClipboardContent}
            />
          ))}
        </div>
      )}
    </div>
  )
}
