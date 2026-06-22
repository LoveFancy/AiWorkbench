/**
 * SidePanel — Agent 侧面板容器
 *
 * 直接展示文件浏览器，默认打开状态。
 * 切换按钮在面板关闭时显示活动指示点。
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai'
import { X, FolderOpen, ExternalLink, RefreshCw, ChevronRight, ChevronDown, GripHorizontal, MoreHorizontal, FolderSearch, Pencil, FolderInput, Info, FolderHeart, MessageSquarePlus, FilePlus, FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { fileToBase64, formatFileNames } from '@/lib/file-utils'
import {
  FileBrowser,
  FileDropZone,
  FileTypeIcon,
  FileSearchBar,
  computeRevealAncestors,
  isPathUnderRoot,
  computeTreeRowLayout,
  AncestorGuides,
  STICKY_ROW_BASE_CLASS,
  canBeSticky,
  eventHasFileTreeDrag,
  eventHasExternalFiles,
  getParentPath,
  isSameOrChildPath,
  normalizeFsPath,
  readFileTreeDragPayload,
} from '@/components/file-browser'
import { DiffPanelTabBar } from '@/components/diff/DiffPanelTabBar'
import { DiffChangesList } from '@/components/diff/DiffChangesList'
import { WorktreeSelector } from '@/components/diff/WorktreeSelector'
import {
  agentSidePanelOpenAtom,
  workspaceFilesVersionAtom,
  currentAgentWorkspaceIdAtom,
  agentWorkspacesAtom,
  agentAttachedDirectoriesMapAtom,
  agentAttachedFilesMapAtom,
  workspaceAttachedDirectoriesMapAtom,
  workspaceAttachedFilesMapAtom,
  agentPendingFilesAtomFamily,
  agentDiffRefreshVersionAtom,
  fileBrowserAutoRevealAtom,
  agentSelectedWorktreeAtom,
} from '@/atoms/agent-atoms'
import { previewPanelOpenMapAtom, previewFileMapAtom, PREVIEW_KIND, type PreviewFile } from '@/atoms/preview-atoms'

import { detectIsWindows } from '@/lib/platform'
import { formatManagedPath } from '@/lib/managed-path-display'
import { isHtmlPreviewPath } from '@/components/diff/html-preview-utils'
import { MAX_ATTACHMENT_SIZE, type CreateFileEntryInput, type FileEntry, type AgentPendingFile } from '@proma/shared'

type CreateEntryTarget = {
  parentDir: string
  type: CreateFileEntryInput['type']
  scope: 'session' | 'workspace'
}

type RootDropTarget = 'session' | 'workspace'

function getPathBasename(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() || filePath
}

function getMediaTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])
  if (!imageExts.has(ext)) return 'application/octet-stream'
  const mimeExt = ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext
  return `image/${mimeExt}`
}

function formatCreateEntryError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error)
  const remotePrefix = "Error invoking remote method 'agent:create-file-entry': Error: "
  if (rawMessage.startsWith(remotePrefix)) {
    return rawMessage.slice(remotePrefix.length)
  }
  return rawMessage || '创建失败'
}

function FileCreateButton({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: 'directory' | 'file'
  onClick: (e: React.MouseEvent) => void
}): React.ReactElement {
  const Icon = icon === 'directory' ? FolderPlus : FilePlus
  const handleClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onClick(e)
  }, [onClick])
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 flex-shrink-0"
          onClick={handleClick}
        >
          <Icon className="size-2.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  )
}

interface SidePanelProps {
  sessionId: string
  sessionPath: string | null
  activeTab: 'workspace' | 'changes'
  onTabChange: (tab: 'workspace' | 'changes') => void
  width?: number
}

const filePanelActionButtonClass = 'h-6 w-6 flex-shrink-0 rounded-md text-muted-foreground/75 hover:bg-accent/70 hover:text-foreground [&_svg]:size-3.5'

export function SidePanel({ sessionId, sessionPath, activeTab, onTabChange, width = 280 }: SidePanelProps): React.ReactElement {
  // per-session 侧面板状态（默认打开）
  const [isOpen, setIsOpen] = useAtom(agentSidePanelOpenAtom)
  const isWindows = React.useMemo(() => detectIsWindows(), [])

  // Tab 系统
  const previewFileMap = useAtomValue(previewFileMapAtom)
  const selectedFilePath = previewFileMap.get(sessionId)?.filePath
  const store = useStore()

  // 预览面板 atoms
  const setPreviewFileMap = useSetAtom(previewFileMapAtom)
  const setPreviewOpenMap = useSetAtom(previewPanelOpenMapAtom)

  // 用 ref 存 basePaths 相关值，避免声明顺序问题
  const basePathsRef = React.useRef<string[]>([])

  const openPreviewTabForFile = React.useCallback((file: PreviewFile) => {
    setPreviewFileMap((prev) => {
      const m = new Map(prev)
      m.set(sessionId, file)
      return m
    })
    // 在中间区域分屏展示文件预览，而非创建独立 Tab
    setPreviewOpenMap((prev) => { const m = new Map(prev); m.set(sessionId, true); return m })
  }, [sessionId, setPreviewFileMap, setPreviewOpenMap])

  const handleFilePreview = React.useCallback((filePath: string) => {
    const bp = basePathsRef.current
    const isHtml = isHtmlPreviewPath(filePath)
    const previewFile: PreviewFile = {
      filePath,
      previewKind: isHtml ? PREVIEW_KIND.HTML : PREVIEW_KIND.FILE,
      previewOnly: true,
      basePaths: bp.length > 0 ? bp : undefined,
    }

    if (isHtml) {
      // HTML 文件：在右侧侧边栏打开实时预览
      setPreviewFileMap((prev) => {
        const m = new Map(prev)
        m.set(sessionId, previewFile)
        return m
      })
      store.set(previewPanelOpenMapAtom, (prev) => {
        const m = new Map(prev)
        m.set(sessionId, true)
        return m
      })
    } else {
      // 非 HTML 文件：在中间区域分屏预览
      openPreviewTabForFile(previewFile)
    }
  }, [sessionId, setPreviewFileMap, store, openPreviewTabForFile])

  // Worktree 选择状态
  const [selectedWorktreeMap, setSelectedWorktreeMap] = useAtom(agentSelectedWorktreeAtom)
  const selectedWorktreePath = selectedWorktreeMap.get(sessionId) ?? null

  const handleWorktreeSelect = React.useCallback((worktree: import('@proma/shared').WorktreeInfo | null) => {
    setSelectedWorktreeMap((prev) => {
      const m = new Map(prev)
      m.set(sessionId, worktree?.path ?? null)
      return m
    })
    if (worktree) {
      window.electronAPI.attachDirectory({ sessionId, directoryPath: worktree.path })
    }
  }, [sessionId, setSelectedWorktreeMap])

  const handleDiffFileClick = React.useCallback((filePath: string, _isUntracked: boolean, gitRoot?: string) => {
    openPreviewTabForFile({
      filePath,
      dirPath: sessionPath || undefined,
      gitRoot,
      baseRef: selectedWorktreePath ? 'origin/main' : undefined,
    })
  }, [openPreviewTabForFile, sessionPath, selectedWorktreePath])

  // 动画标志：isOpen 变化时启用过渡动画，切换会话时即时显示
  const prevIsOpenRef = React.useRef(isOpen)
  const prevSessionIdRef = React.useRef(sessionId)
  const shouldAnimate = prevSessionIdRef.current === sessionId && prevIsOpenRef.current !== isOpen
  React.useEffect(() => {
    prevIsOpenRef.current = isOpen
    prevSessionIdRef.current = sessionId
  })

  const filesVersion = useAtomValue(workspaceFilesVersionAtom)
  const setFilesVersion = useSetAtom(workspaceFilesVersionAtom)
  const setAutoReveal = useSetAtom(fileBrowserAutoRevealAtom)
  const diffRefreshVersionMap = useAtomValue(agentDiffRefreshVersionAtom)
  const diffRefreshVersion = diffRefreshVersionMap.get(sessionId) ?? 0
  const hasFileChanges = filesVersion > 0

  // 派生当前工作区 slug（用于 FileDropZone IPC 调用）
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const workspaceSlug = workspaces.find((w) => w.id === currentWorkspaceId)?.slug ?? null

  // 附加目录列表（会话级）
  const attachedDirsMap = useAtomValue(agentAttachedDirectoriesMapAtom)
  const setAttachedDirsMap = useSetAtom(agentAttachedDirectoriesMapAtom)
  const attachedDirs = attachedDirsMap.get(sessionId) ?? []
  const attachedFilesMap = useAtomValue(agentAttachedFilesMapAtom)
  const setAttachedFilesMap = useSetAtom(agentAttachedFilesMapAtom)
  const attachedFiles = attachedFilesMap.get(sessionId) ?? []

  // 附加目录列表（工作区级）
  const wsAttachedDirsMap = useAtomValue(workspaceAttachedDirectoriesMapAtom)
  const setWsAttachedDirsMap = useSetAtom(workspaceAttachedDirectoriesMapAtom)
  const wsAttachedDirs = currentWorkspaceId ? (wsAttachedDirsMap.get(currentWorkspaceId) ?? []) : []
  const wsAttachedFilesMap = useAtomValue(workspaceAttachedFilesMapAtom)
  const setWsAttachedFilesMap = useSetAtom(workspaceAttachedFilesMapAtom)
  const wsAttachedFiles = currentWorkspaceId ? (wsAttachedFilesMap.get(currentWorkspaceId) ?? []) : []

  const extraPathsMemo = React.useMemo(
    () => [...attachedDirs, ...wsAttachedDirs],
    [attachedDirs, wsAttachedDirs]
  )

  const fileAccessPathsMemo = React.useMemo(
    () => [...extraPathsMemo, ...attachedFiles, ...wsAttachedFiles],
    [extraPathsMemo, attachedFiles, wsAttachedFiles]
  )

  // 加载工作区级附加目录
  React.useEffect(() => {
    if (!workspaceSlug || !currentWorkspaceId) return
    window.electronAPI.getWorkspaceDirectories(workspaceSlug)
      .then((dirs) => {
        setWsAttachedDirsMap((prev) => {
          const map = new Map(prev)
          map.set(currentWorkspaceId, dirs)
          return map
        })
      })
      .catch(console.error)
  }, [workspaceSlug, currentWorkspaceId, setWsAttachedDirsMap])

  // 加载工作区级附加文件
  React.useEffect(() => {
    if (!workspaceSlug || !currentWorkspaceId) return
    window.electronAPI.getWorkspaceAttachedFiles(workspaceSlug)
      .then((files) => {
        setWsAttachedFilesMap((prev) => {
          const map = new Map(prev)
          map.set(currentWorkspaceId, files)
          return map
        })
      })
      .catch(console.error)
  }, [workspaceSlug, currentWorkspaceId, setWsAttachedFilesMap])

  // === 会话级：附加/移除目录 ===

  const attachSessionDir = React.useCallback(async (dirPath: string) => {
    const updated = await window.electronAPI.attachDirectory({ sessionId, directoryPath: dirPath })
    setAttachedDirsMap((prev) => {
      const map = new Map(prev)
      map.set(sessionId, updated)
      return map
    })
  }, [sessionId, setAttachedDirsMap])

  const handleAttachFolder = React.useCallback(async () => {
    try {
      const result = await window.electronAPI.openFolderDialog()
      if (result) await attachSessionDir(result.path)
    } catch (error) {
      console.error('[SidePanel] 附加文件夹失败:', error)
    }
  }, [attachSessionDir])

  const handleSessionFoldersDropped = React.useCallback(async (folderPaths: string[]) => {
    for (const dirPath of folderPaths) {
      try { await attachSessionDir(dirPath) } catch (error) {
        console.error('[SidePanel] 拖拽附加文件夹失败:', error)
      }
    }
  }, [attachSessionDir])

  const handleDetachDirectory = React.useCallback(async (dirPath: string) => {
    try {
      const updated = await window.electronAPI.detachDirectory({ sessionId, directoryPath: dirPath })
      setAttachedDirsMap((prev) => {
        const map = new Map(prev)
        if (updated.length > 0) { map.set(sessionId, updated) } else { map.delete(sessionId) }
        return map
      })
    } catch (error) {
      console.error('[SidePanel] 移除附加目录失败:', error)
    }
  }, [sessionId, setAttachedDirsMap])

  const attachSessionFile = React.useCallback(async (filePath: string) => {
    const updated = await window.electronAPI.attachFile({ sessionId, filePath })
    setAttachedFilesMap((prev) => {
      const map = new Map(prev)
      map.set(sessionId, updated)
      return map
    })
  }, [sessionId, setAttachedFilesMap])

  const handleSessionFilesAttached = React.useCallback(async (filePaths: string[]) => {
    for (const filePath of filePaths) {
      try { await attachSessionFile(filePath) } catch (error) {
        console.error('[SidePanel] 附加文件失败:', error)
      }
    }
  }, [attachSessionFile])

  const handleDetachFile = React.useCallback(async (filePath: string) => {
    try {
      const updated = await window.electronAPI.detachFile({ sessionId, filePath })
      setAttachedFilesMap((prev) => {
        const map = new Map(prev)
        if (updated.length > 0) { map.set(sessionId, updated) } else { map.delete(sessionId) }
        return map
      })
    } catch (error) {
      console.error('[SidePanel] 移除附加文件失败:', error)
    }
  }, [sessionId, setAttachedFilesMap])

  // === 工作区级：附加/移除目录 ===

  const attachWorkspaceDir = React.useCallback(async (dirPath: string) => {
    if (!workspaceSlug || !currentWorkspaceId) return
    const updated = await window.electronAPI.attachWorkspaceDirectory({ workspaceSlug, directoryPath: dirPath })
    setWsAttachedDirsMap((prev) => {
      const map = new Map(prev)
      map.set(currentWorkspaceId, updated)
      return map
    })
  }, [workspaceSlug, currentWorkspaceId, setWsAttachedDirsMap])

  const handleAttachWorkspaceFolder = React.useCallback(async () => {
    try {
      const result = await window.electronAPI.openFolderDialog()
      if (result) await attachWorkspaceDir(result.path)
    } catch (error) {
      console.error('[SidePanel] 附加工作区文件夹失败:', error)
    }
  }, [attachWorkspaceDir])

  const handleWorkspaceFoldersDropped = React.useCallback(async (folderPaths: string[]) => {
    for (const dirPath of folderPaths) {
      try { await attachWorkspaceDir(dirPath) } catch (error) {
        console.error('[SidePanel] 拖拽附加工作区文件夹失败:', error)
      }
    }
  }, [attachWorkspaceDir])

  const handleDetachWorkspaceDirectory = React.useCallback(async (dirPath: string) => {
    if (!workspaceSlug || !currentWorkspaceId) return
    try {
      const updated = await window.electronAPI.detachWorkspaceDirectory({ workspaceSlug, directoryPath: dirPath })
      setWsAttachedDirsMap((prev) => {
        const map = new Map(prev)
        if (updated.length > 0) { map.set(currentWorkspaceId, updated) } else { map.delete(currentWorkspaceId) }
        return map
      })
    } catch (error) {
      console.error('[SidePanel] 移除工作区附加目录失败:', error)
    }
  }, [workspaceSlug, currentWorkspaceId, setWsAttachedDirsMap])

  const attachWorkspaceFile = React.useCallback(async (filePath: string) => {
    if (!workspaceSlug || !currentWorkspaceId) return
    const updated = await window.electronAPI.attachWorkspaceFile({ workspaceSlug, filePath })
    setWsAttachedFilesMap((prev) => {
      const map = new Map(prev)
      map.set(currentWorkspaceId, updated)
      return map
    })
  }, [workspaceSlug, currentWorkspaceId, setWsAttachedFilesMap])

  const handleWorkspaceFilesAttached = React.useCallback(async (filePaths: string[]) => {
    for (const filePath of filePaths) {
      try { await attachWorkspaceFile(filePath) } catch (error) {
        console.error('[SidePanel] 附加工作区文件失败:', error)
      }
    }
  }, [attachWorkspaceFile])

  const handleDetachWorkspaceFile = React.useCallback(async (filePath: string) => {
    if (!workspaceSlug || !currentWorkspaceId) return
    try {
      const updated = await window.electronAPI.detachWorkspaceFile({ workspaceSlug, filePath })
      setWsAttachedFilesMap((prev) => {
        const map = new Map(prev)
        if (updated.length > 0) { map.set(currentWorkspaceId, updated) } else { map.delete(currentWorkspaceId) }
        return map
      })
    } catch (error) {
      console.error('[SidePanel] 移除工作区附加文件失败:', error)
    }
  }, [workspaceSlug, currentWorkspaceId, setWsAttachedFilesMap])

  // 文件上传完成后递增版本号，触发 FileBrowser 刷新
  const handleFilesUploaded = React.useCallback(() => {
    setFilesVersion((prev) => prev + 1)
  }, [setFilesVersion])

  // 手动刷新文件列表
  const handleRefresh = React.useCallback(() => {
    setFilesVersion((prev) => prev + 1)
  }, [setFilesVersion])

  // 添加文件到聊天
  const pendingFiles = useAtomValue(agentPendingFilesAtomFamily(sessionId))
  const setPendingFiles = useSetAtom(agentPendingFilesAtomFamily(sessionId))
  const handleAddToChat = React.useCallback((entry: FileEntry) => {
    // 先在 setter 外部检查去重，避免在 updater 函数内执行不可逆副作用
    if (pendingFiles.some((f) => f.sourcePath === entry.path)) return

    const pending: AgentPendingFile = {
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      filename: entry.name,
      mediaType: getMediaTypeFromFilename(entry.name),
      size: entry.size ?? 0,
      sourcePath: entry.path,
    }

    // 有 sourcePath 的文件发送时直接引用原路径，不需要存 base64
    setPendingFiles((prev) => [...prev, pending])
  }, [pendingFiles, setPendingFiles])

  // 工作区文件目录路径
  const [workspaceFilesPath, setWorkspaceFilesPath] = React.useState<string | null>(null)
  const [sessionCreateDir, setSessionCreateDir] = React.useState<string | null>(null)
  const [workspaceCreateDir, setWorkspaceCreateDir] = React.useState<string | null>(null)
  const [sessionSelectionClearSignal, setSessionSelectionClearSignal] = React.useState(0)
  const [workspaceSelectionClearSignal, setWorkspaceSelectionClearSignal] = React.useState(0)
  const [rootDropTarget, setRootDropTarget] = React.useState<RootDropTarget | null>(null)
  const [focusedFileArea, setFocusedFileArea] = React.useState<RootDropTarget | null>(null)
  const [dropZoneClearSignal, setDropZoneClearSignal] = React.useState(0)
  // 折叠状态
  const [sessionCollapsed, setSessionCollapsed] = React.useState(false)
  const [workspaceCollapsed, setWorkspaceCollapsed] = React.useState(false)
  // 分屏比例（会话文件占比，默认 0.4 = 40% 给会话文件，60% 给工作区文件）
  const [splitRatio, setSplitRatio] = React.useState(0.4)
  const splitDragging = React.useRef(false)
  const splitContainerRef = React.useRef<HTMLDivElement>(null)
  const [createTarget, setCreateTarget] = React.useState<CreateEntryTarget | null>(null)
  const [createName, setCreateName] = React.useState('')
  const [createError, setCreateError] = React.useState<string | null>(null)
  const [creatingEntry, setCreatingEntry] = React.useState(false)
  const createInputRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (!workspaceSlug) {
      setWorkspaceFilesPath(null)
      return
    }
    window.electronAPI.getWorkspaceFilesPath(workspaceSlug).then(setWorkspaceFilesPath).catch(() => setWorkspaceFilesPath(null))
  }, [workspaceSlug])

  React.useEffect(() => {
    setSessionCreateDir(null)
  }, [sessionPath])

  React.useEffect(() => {
    setWorkspaceCreateDir(null)
  }, [workspaceFilesPath])

  React.useEffect(() => {
    if (!createTarget) return
    const timer = setTimeout(() => {
      createInputRef.current?.focus()
      createInputRef.current?.select()
    }, 50)
    return () => clearTimeout(timer)
  }, [createTarget])

  const openCreateDialog = React.useCallback((target: CreateEntryTarget) => {
    setCreateTarget(target)
    setCreateName(target.type === 'file' ? 'untitled.md' : '新建文件夹')
    setCreateError(null)
  }, [])

  const handleSessionFilesBlankClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    setSessionCreateDir(null)
    setSessionSelectionClearSignal((signal) => signal + 1)
  }, [])

  const handleWorkspaceFilesBlankClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    setWorkspaceCreateDir(null)
    setWorkspaceSelectionClearSignal((signal) => signal + 1)
  }, [])

  const movePathsToRootDirectory = React.useCallback(async (paths: string[], targetDir: string): Promise<void> => {
    const uniquePaths = Array.from(new Set(paths))
    const movablePaths = uniquePaths.filter((path) => {
      if (normalizeFsPath(getParentPath(path)) === normalizeFsPath(targetDir)) return false
      if (isSameOrChildPath(path, targetDir)) return false
      return true
    })
    if (movablePaths.length === 0) return

    try {
      for (const path of movablePaths) {
        await window.electronAPI.moveFile(path, targetDir)
      }
      setSessionCreateDir(null)
      setWorkspaceCreateDir(null)
      setSessionSelectionClearSignal((signal) => signal + 1)
      setWorkspaceSelectionClearSignal((signal) => signal + 1)
      handleFilesUploaded()
    } catch (error) {
      console.error('[SidePanel] 拖拽到根目录失败:', error)
    }
  }, [handleFilesUploaded])

  const saveExternalFilesToRoot = React.useCallback(async (files: File[], target: RootDropTarget, targetDir?: string): Promise<void> => {
    if (files.length === 0) return
    if (!workspaceSlug) return
    if (target === 'session' && !sessionPath) return
    if (target === 'workspace' && !workspaceFilesPath) return

    const oversized: string[] = []
    const okFiles: File[] = []

    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        oversized.push(file.name)
      } else {
        okFiles.push(file)
      }
    }

    if (oversized.length > 0) {
      toast.error(`以下文件超过 100MB，未复制到工作文件夹：${formatFileNames(oversized)}`, {
        description: '可改用「附加文件夹」或在输入框中作为文件引用发送。',
      })
    }
    if (okFiles.length === 0) return

    try {
      const fileEntries: Array<{ filename: string; data: string }> = []
      for (const file of okFiles) {
        fileEntries.push({
          filename: file.name,
          data: await fileToBase64(file),
        })
      }

      if (target === 'session') {
        await window.electronAPI.saveFilesToAgentSession({
          workspaceSlug,
          sessionId,
          files: fileEntries,
          targetDir,
        })
      } else {
        await window.electronAPI.saveFilesToWorkspaceFiles({
          workspaceSlug,
          files: fileEntries,
          targetDir,
        })
      }

      handleFilesUploaded()
      toast.success(`已添加 ${okFiles.length} 个文件到${target === 'session' ? '会话文件' : '工作区文件'}`)
    } catch (error) {
      console.error('[SidePanel] 保存外部文件失败:', error)
      toast.error('文件添加失败')
    }
  }, [handleFilesUploaded, sessionId, sessionPath, workspaceFilesPath, workspaceSlug])

  /**
   * 将外部拖入的文件/文件夹复制进文件树里的某个目录。
   *
   * paths 必须由调用方在 drop 事件同步执行期内解析（见 FileBrowser.handleDrop），
   * 此处不能再调用 getPathForFile——经过 await 后 File 的 native 资源已释放，调用会导致渲染进程崩溃。
   * 无法解析磁盘路径的文件（如剪贴板虚拟文件）通过 unresolvedFiles 走 base64 兜底保存。
   */
  const saveExternalItemsToDirectory = React.useCallback(async (
    payload: { paths: string[]; unresolvedFiles: File[] },
    target: RootDropTarget,
    targetDir: string,
  ): Promise<void> => {
    const { paths: sourcePaths, unresolvedFiles } = payload
    if (sourcePaths.length === 0 && unresolvedFiles.length === 0) return
    if (!workspaceSlug) return

    // 全部无法解析磁盘路径 → 走原有纯文件保存逻辑
    if (sourcePaths.length === 0) {
      await saveExternalFilesToRoot(unresolvedFiles, target, targetDir)
      return
    }

    try {
      const result = await window.electronAPI.copyExternalPathsIntoManagedDir({
        workspaceSlug,
        scope: target,
        sessionId,
        targetDir,
        sourcePaths,
      })

      // 极少数无法解析磁盘路径的文件，走旧逻辑兜底复制
      if (unresolvedFiles.length > 0) {
        await saveExternalFilesToRoot(unresolvedFiles, target, targetDir)
      }

      handleFilesUploaded()

      if (result.copied.length > 0) {
        toast.success(`已复制 ${result.copied.length} 个项目到${target === 'session' ? '会话文件' : '工作区文件'}`)
      }
      if (result.skipped.length > 0) {
        toast.error(`${result.skipped.length} 个项目未复制`, {
          description: formatFileNames(result.skipped.map((item) => item.reason)),
        })
      }
    } catch (error) {
      console.error('[SidePanel] 复制外部文件/文件夹失败:', error)
      toast.error('文件添加失败', { description: '目标目录可能已被删除，请刷新后重试。' })
      handleFilesUploaded()
    }
  }, [handleFilesUploaded, saveExternalFilesToRoot, sessionId, workspaceSlug])

  const clearDropZoneHighlight = React.useCallback((): void => {
    setDropZoneClearSignal((signal) => signal + 1)
  }, [])

  const handleExternalRootDrop = React.useCallback(async (event: React.DragEvent<HTMLDivElement>, target: RootDropTarget): Promise<void> => {
    const droppedFiles = Array.from(event.dataTransfer.files)
    if (droppedFiles.length === 0) return

    event.preventDefault()
    event.stopPropagation()
    setRootDropTarget(null)

    const pathMap = new Map<string, File>()
    const paths: string[] = []
    for (const file of droppedFiles) {
      try {
        const path = window.electronAPI.getPathForFile(file)
        if (path) {
          paths.push(path)
          pathMap.set(path, file)
        }
      } catch { /* 无法获取路径时忽略 */ }
    }

    if (paths.length === 0) {
      await saveExternalFilesToRoot(droppedFiles, target)
      return
    }

    try {
      const { directories, files } = await window.electronAPI.checkPathsType(paths)
      const regularFiles = files.flatMap((path) => {
        const file = pathMap.get(path)
        return file ? [file] : []
      })

      await saveExternalFilesToRoot(regularFiles, target)

      if (directories.length > 0) {
        if (target === 'session') {
          await handleSessionFoldersDropped(directories)
        } else {
          await handleWorkspaceFoldersDropped(directories)
        }
        toast.success(`已附加 ${directories.length} 个文件夹`)
      }
    } catch (error) {
      console.error('[SidePanel] 外部拖拽路径检测失败:', error)
      await saveExternalFilesToRoot(droppedFiles, target)
    }
  }, [handleSessionFoldersDropped, handleWorkspaceFoldersDropped, saveExternalFilesToRoot])

  const getRootDropDir = React.useCallback((target: RootDropTarget): string | null => {
    return target === 'session' ? sessionPath : workspaceFilesPath
  }, [sessionPath, workspaceFilesPath])

  const handleRootDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>, target: RootDropTarget): void => {
    const targetDir = getRootDropDir(target)
    if (!targetDir) return
    if (!eventHasFileTreeDrag(event) && eventHasExternalFiles(event)) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      clearDropZoneHighlight()
      setRootDropTarget(target)
      return
    }
    if (!eventHasFileTreeDrag(event)) return
    const payload = readFileTreeDragPayload(event)
    if (!payload) return
    const canDrop = payload.paths.some((path) => {
      if (normalizeFsPath(getParentPath(path)) === normalizeFsPath(targetDir)) return false
      return !isSameOrChildPath(path, targetDir)
    })
    if (!canDrop) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    clearDropZoneHighlight()
    setRootDropTarget(target)
  }, [clearDropZoneHighlight, getRootDropDir])

  const handleRootDragLeave = React.useCallback((event: React.DragEvent<HTMLDivElement>, target: RootDropTarget): void => {
    const related = event.relatedTarget as Node | null
    if (related && event.currentTarget.contains(related)) return
    setRootDropTarget((current) => current === target ? null : current)
  }, [])

  const handleRootDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>, target: RootDropTarget): void => {
    const isExternalFileDrop = !eventHasFileTreeDrag(event) && event.dataTransfer.files.length > 0
    if (isExternalFileDrop) {
      void handleExternalRootDrop(event, target)
      return
    }
    const targetDir = getRootDropDir(target)
    const payload = readFileTreeDragPayload(event)
    if (!targetDir || !payload) return
    event.preventDefault()
    event.stopPropagation()
    setRootDropTarget(null)
    void movePathsToRootDirectory(payload.paths, targetDir)
  }, [getRootDropDir, handleExternalRootDrop, movePathsToRootDirectory])

  const handleFileAreaPaste = React.useCallback((event: React.ClipboardEvent<HTMLDivElement>, target: RootDropTarget): void => {
    const files = Array.from(event.clipboardData.files ?? [])
    if (files.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    void saveExternalFilesToRoot(files, target)
  }, [saveExternalFilesToRoot])

  const closeCreateDialog = React.useCallback(() => {
    if (creatingEntry) return
    setCreateTarget(null)
    setCreateName('')
    setCreateError(null)
  }, [creatingEntry])

  const handleCreateEntry = React.useCallback(async () => {
    if (!createTarget) return
    const trimmed = createName.trim()
    if (!trimmed) {
      setCreateError('名称不能为空')
      return
    }

    setCreatingEntry(true)
    setCreateError(null)
    try {
      const entry = await window.electronAPI.createFileEntry({
        parentDir: createTarget.parentDir,
        name: trimmed,
        type: createTarget.type,
      })
      setFilesVersion((version) => version + 1)
      setAutoReveal({ sessionId, path: entry.path, ts: Date.now(), select: true })
      setCreateTarget(null)
      setCreateName('')
    } catch (error) {
      setCreateError(formatCreateEntryError(error))
    } finally {
      setCreatingEntry(false)
    }
  }, [createName, createTarget, sessionId, setAutoReveal, setFilesVersion])

  // RightSidePanel 完全由用户控制，不因 Agent 文件变更自动打开

  // 同步 basePaths ref（供 handleFilePreview 使用，避免 hooks 声明顺序问题）
  basePathsRef.current = [sessionPath, workspaceFilesPath, ...fileAccessPathsMemo].filter(Boolean) as string[]
  const hasSessionAttachedItems = attachedDirs.length > 0 || attachedFiles.length > 0
  const hasWorkspaceAttachedItems = wsAttachedDirs.length > 0 || wsAttachedFiles.length > 0
  const sessionDisplayPath = sessionPath
    ? formatManagedPath(sessionPath, { sessionPath, workspaceFilesPath })
    : ''
  const workspaceDisplayPath = workspaceFilesPath
    ? formatManagedPath(workspaceFilesPath, { sessionPath, workspaceFilesPath })
    : ''

  // 分屏拖拽处理
  const handleSplitDragStart = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    splitDragging.current = true
    const container = splitContainerRef.current
    if (!container) return
    const startY = e.clientY
    const startRatio = splitRatio
    const containerHeight = container.clientHeight
    let rafId = 0

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'row-resize'

    const onMouseMove = (ev: MouseEvent) => {
      if (!splitDragging.current) return
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const delta = ev.clientY - startY
        const newRatio = startRatio + delta / containerHeight
        setSplitRatio(Math.max(0.15, Math.min(0.85, newRatio)))
      })
    }

    const onMouseUp = () => {
      splitDragging.current = false
      if (rafId) cancelAnimationFrame(rafId)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [splitRatio])

  return (
    <div
      className={cn(
        'relative z-0 h-full flex-shrink-0 overflow-hidden titlebar-drag-region bg-content-area rounded-2xl shadow-xl',
        shouldAnimate && 'transition-[width] duration-300 ease-in-out',
        isOpen ? '' : '!w-0',
      )}
      style={isOpen ? { width } : undefined}
    >
      {/* 面板内容 */}
      <div
        className={cn(
          'w-full h-full flex flex-col titlebar-no-drag',
          isWindows ? 'pt-[34px]' : 'pt-0',
          shouldAnimate && 'transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        >
          <DiffPanelTabBar activeTab={activeTab} onTabChange={onTabChange} onClose={() => setIsOpen(false)} />

          {activeTab === 'changes' ? (
            sessionPath ? (
              <>
                <WorktreeSelector
                  sessionId={sessionId}
                  workspaceSlug={workspaceSlug || ''}
                  selectedPath={selectedWorktreePath}
                  onSelect={handleWorktreeSelect}
                />
                <DiffChangesList
                  key={sessionId}
                  dirPath={sessionPath}
                  sessionId={sessionId}
                  sessionPath={sessionPath}
                  workspaceFilesPath={workspaceFilesPath || undefined}
                  extraPaths={extraPathsMemo}
                  refreshVersion={diffRefreshVersion}
                  selectedFilePath={selectedFilePath}
                  onFileClick={handleDiffFileClick}
                  worktreeMode={selectedWorktreePath ? { path: selectedWorktreePath, baseBranch: 'origin/main' } : undefined}
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">等待会话初始化...</div>
            )
          ) : (
            <div className="flex-1 min-h-0 flex flex-col pt-0.5" ref={splitContainerRef}>
              {/* === 会话文件区域 === */}
              {sessionPath && (
                <>
                  <div className="flex items-center gap-1 px-2 h-[32px] flex-shrink-0 mx-2 cursor-pointer" onClick={() => setSessionCollapsed(!sessionCollapsed)}>
                    {sessionCollapsed ? <ChevronRight className="size-3 text-muted-foreground" /> : <ChevronDown className="size-3 text-muted-foreground" />}
                    <FolderOpen className="size-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-muted-foreground">会话文件</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="size-3 text-muted-foreground/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[200px]">
                        <p>当前会话的专属文件，仅本次对话的 Agent 可以访问</p>
                      </TooltipContent>
                    </Tooltip>
                    <span className="text-[10px] text-muted-foreground/70 truncate flex-1 min-w-0" title={sessionPath}>
                      {sessionDisplayPath}
                    </span>
                    {!sessionCollapsed && (
                      <>
                    <FileCreateButton
                      label="新建文件"
                      icon="file"
                      onClick={() => openCreateDialog({ parentDir: sessionCreateDir ?? sessionPath, type: 'file', scope: 'session' })}
                    />
                    <FileCreateButton
                      label="新建文件夹"
                      icon="directory"
                      onClick={() => openCreateDialog({ parentDir: sessionCreateDir ?? sessionPath, type: 'directory', scope: 'session' })}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={filePanelActionButtonClass}
                          onClick={(e) => { e.stopPropagation(); window.electronAPI.openFile(sessionPath).catch(console.error) }}
                        >
                          <ExternalLink />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>在 Finder 中打开</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={filePanelActionButtonClass}
                          onClick={(e) => { e.stopPropagation(); handleRefresh() }}
                        >
                          <RefreshCw />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>刷新文件列表</p>
                      </TooltipContent>
                    </Tooltip>
                      </>
                    )}
                    </div>
                  {!sessionCollapsed && (
                    <div className="mx-2 mb-1 flex flex-col min-h-0" style={{ flex: workspaceCollapsed ? '1 1 auto' : `0 0 ${splitRatio * 100}%` }}>
                    <FileSearchBar
                      workspaceFilesPath={null}
                      sessionPath={sessionPath}
                      sessionAttachedDirs={attachedDirs}
                      workspaceAttachedDirs={[]}
                      placeholder="搜索会话文件..."
                      sessionId={sessionId}
                      onFilePreview={handleFilePreview}
                    />
                    <div
                      tabIndex={0}
                      className={cn(
                        'flex-1 min-h-0 overflow-y-auto scrollbar-thin rounded-lg transition-colors outline-none',
                        rootDropTarget === 'session' && 'bg-accent/40 ring-1 ring-primary/35 ring-inset',
                        focusedFileArea === 'session' && rootDropTarget !== 'session' && 'ring-1 ring-border/50 ring-inset',
                      )}
                      onClick={handleSessionFilesBlankClick}
                      onFocus={() => setFocusedFileArea('session')}
                      onBlur={() => setFocusedFileArea((current) => current === 'session' ? null : current)}
                      onDragOver={(event) => handleRootDragOver(event, 'session')}
                      onDragLeave={(event) => handleRootDragLeave(event, 'session')}
                      onDrop={(event) => handleRootDrop(event, 'session')}
                      onPaste={(event) => handleFileAreaPaste(event, 'session')}
                    >
                      {attachedFiles.length > 0 && (
                        <AttachedFilesSection
                          attachedFiles={attachedFiles}
                          onDetach={handleDetachFile}
                          onAddToChat={handleAddToChat}
                          onFilePreview={handleFilePreview}
                          allowedPaths={basePathsRef.current}
                          sessionId={sessionId}
                        />
                      )}
                      {attachedDirs.length > 0 && (
                        <AttachedDirsSection
                          attachedDirs={attachedDirs}
                          onDetach={handleDetachDirectory}
                          refreshVersion={filesVersion}
                          onFilesMoved={handleFilesUploaded}
                          onDirectoryDropTargetActive={clearDropZoneHighlight}
                          onAddToChat={handleAddToChat}
                          onFilePreview={handleFilePreview}
                          allowedPaths={basePathsRef.current}
                          sessionId={sessionId}
                        />
                      )}
                      <>
                        {hasSessionAttachedItems && (
                          <div className="text-[11px] font-medium text-muted-foreground mb-1 px-3 pt-2">工作文件（存储于该工作区目录）</div>
                        )}
                        <FileBrowser
                          rootPath={sessionPath}
                          hideToolbar
                          embedded
                          hideEmpty={hasSessionAttachedItems}
                          displayRoots={{ sessionPath, workspaceFilesPath }}
                          clearSelectionSignal={sessionSelectionClearSignal}
                          onAddToChat={handleAddToChat}
                          onFilePreview={handleFilePreview}
                          onSelectedDirectoryChange={setSessionCreateDir}
                          onCreateEntry={(parentDir, type) => openCreateDialog({ parentDir, type, scope: 'session' })}
                          transferTarget={{ label: '转移到工作区', targetDir: workspaceFilesPath }}
                          onFilesMoved={handleFilesUploaded}
                          onDirectoryDropTargetActive={clearDropZoneHighlight}
                          onExternalFilesDropToDirectory={(payload, targetDir) => {
                            clearDropZoneHighlight()
                            return saveExternalItemsToDirectory(payload, 'session', targetDir)
                          }}
                        />
                      </>
                      <FileDropZone
                        workspaceSlug={workspaceSlug ?? ''}
                        sessionId={sessionId}
                        target="session"
                        onFilesUploaded={handleFilesUploaded}
                        onFilesAttached={handleSessionFilesAttached}
                        onAttachFolder={handleAttachFolder}
                        onFoldersDropped={handleSessionFoldersDropped}
                        clearDragOverSignal={dropZoneClearSignal}
                        passiveDuringDrag
                      />
                    </div>
                  </div>
                  )}
                </>
              )}

              {/* 分屏拖拽手柄 — 仅两者都展开时显示 */}
              {sessionPath && !sessionCollapsed && !workspaceCollapsed && (
                <div className="flex items-center justify-center h-[10px] flex-shrink-0 cursor-row-resize hover:bg-primary/10 transition-colors group mx-2" onMouseDown={handleSplitDragStart}>
                  <GripHorizontal className="size-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </div>
              )}

              {/* === 工作区文件区域 === */}
              <div className="flex flex-col mx-2 mb-2 min-h-0" style={{ flex: sessionCollapsed ? '1 1 auto' : workspaceCollapsed ? '0 0 auto' : `1 1 ${(1 - splitRatio) * 100}%` }}>
                <div className="flex items-center gap-1 px-2 h-[32px] flex-shrink-0 cursor-pointer" onClick={() => setWorkspaceCollapsed(!workspaceCollapsed)}>
                  {workspaceCollapsed ? <ChevronRight className="size-3 text-muted-foreground" /> : <ChevronDown className="size-3 text-muted-foreground" />}
                  <FolderHeart className="size-3 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-muted-foreground">工作区文件</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3 text-muted-foreground/50 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[220px]">
                      <p>工作区内所有会话可访问的文件和文件夹，每个新对话都可以自动读取</p>
                    </TooltipContent>
                  </Tooltip>
                  {workspaceFilesPath ? (
                    <span className="text-[10px] text-muted-foreground/70 truncate flex-1 min-w-0" title={workspaceFilesPath}>
                      {workspaceDisplayPath}
                    </span>
                  ) : (
                    <div className="flex-1" />
                  )}
                  {workspaceFilesPath && !workspaceCollapsed && (
                    <>
                      <FileCreateButton
                        label="新建文件"
                        icon="file"
                        onClick={() => openCreateDialog({ parentDir: workspaceCreateDir ?? workspaceFilesPath, type: 'file', scope: 'workspace' })}
                      />
                      <FileCreateButton
                        label="新建文件夹"
                        icon="directory"
                        onClick={() => openCreateDialog({ parentDir: workspaceCreateDir ?? workspaceFilesPath, type: 'directory', scope: 'workspace' })}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={filePanelActionButtonClass}
                            onClick={(e) => { e.stopPropagation(); window.electronAPI.openFile(workspaceFilesPath).catch(console.error) }}
                          >
                            <ExternalLink />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>在 Finder 中打开工作区文件目录</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={filePanelActionButtonClass}
                            onClick={(e) => { e.stopPropagation(); handleRefresh() }}
                          >
                            <RefreshCw />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>刷新文件列表</p>
                        </TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>
                {!workspaceCollapsed && (
                  <>
                  <FileSearchBar
                    workspaceFilesPath={workspaceFilesPath}
                    sessionPath={null}
                    sessionAttachedDirs={[]}
                    workspaceAttachedDirs={wsAttachedDirs}
                    placeholder="搜索工作区文件..."
                    sessionId={sessionId}
                    onFilePreview={handleFilePreview}
                  />
                  <div
                    tabIndex={0}
                    className={cn(
                      'flex-1 min-h-0 overflow-y-auto pb-1 scrollbar-thin rounded-lg transition-colors outline-none',
                      rootDropTarget === 'workspace' && 'bg-accent/40 ring-1 ring-primary/35 ring-inset',
                      focusedFileArea === 'workspace' && rootDropTarget !== 'workspace' && 'ring-1 ring-border/50 ring-inset',
                    )}
                    onClick={handleWorkspaceFilesBlankClick}
                    onFocus={() => setFocusedFileArea('workspace')}
                    onBlur={() => setFocusedFileArea((current) => current === 'workspace' ? null : current)}
                    onDragOver={(event) => handleRootDragOver(event, 'workspace')}
                    onDragLeave={(event) => handleRootDragLeave(event, 'workspace')}
                    onDrop={(event) => handleRootDrop(event, 'workspace')}
                    onPaste={(event) => handleFileAreaPaste(event, 'workspace')}
                  >
                    {wsAttachedFiles.length > 0 && (
                      <AttachedFilesSection
                        attachedFiles={wsAttachedFiles}
                        onDetach={handleDetachWorkspaceFile}
                        onAddToChat={handleAddToChat}
                        onFilePreview={handleFilePreview}
                        allowedPaths={basePathsRef.current}
                        sessionId={sessionId}
                      />
                    )}
                    {wsAttachedDirs.length > 0 && (
                      <AttachedDirsSection
                        attachedDirs={wsAttachedDirs}
                        onDetach={handleDetachWorkspaceDirectory}
                        refreshVersion={filesVersion}
                        onFilesMoved={handleFilesUploaded}
                        onDirectoryDropTargetActive={clearDropZoneHighlight}
                        onAddToChat={handleAddToChat}
                        onFilePreview={handleFilePreview}
                        allowedPaths={basePathsRef.current}
                        sessionId={sessionId}
                      />
                    )}
                    {workspaceFilesPath && (
                      <>
                        {hasWorkspaceAttachedItems && (
                          <div className="text-[11px] font-medium text-muted-foreground mb-1 px-3 pt-2">工作文件（存储于该工作区目录）</div>
                        )}
                        <FileBrowser
                          rootPath={workspaceFilesPath}
                          hideToolbar
                          embedded
                          hideEmpty={hasWorkspaceAttachedItems}
                          displayRoots={{ sessionPath, workspaceFilesPath }}
                          clearSelectionSignal={workspaceSelectionClearSignal}
                          onAddToChat={handleAddToChat}
                          onFilePreview={handleFilePreview}
                          onSelectedDirectoryChange={setWorkspaceCreateDir}
                          onCreateEntry={(parentDir, type) => openCreateDialog({ parentDir, type, scope: 'workspace' })}
                          transferTarget={{ label: '转移到当前会话', targetDir: sessionPath }}
                          onFilesMoved={handleFilesUploaded}
                          onDirectoryDropTargetActive={clearDropZoneHighlight}
                          onExternalFilesDropToDirectory={(payload, targetDir) => {
                            clearDropZoneHighlight()
                            return saveExternalItemsToDirectory(payload, 'workspace', targetDir)
                          }}
                        />
                      </>
                    )}
                    <FileDropZone
                      workspaceSlug={workspaceSlug ?? ''}
                      target="workspace"
                      onFilesUploaded={handleFilesUploaded}
                      onFilesAttached={handleWorkspaceFilesAttached}
                      onAttachFolder={handleAttachWorkspaceFolder}
                      onFoldersDropped={handleWorkspaceFoldersDropped}
                      clearDragOverSignal={dropZoneClearSignal}
                      passiveDuringDrag
                    />
                  </div>
                  </>
                )}
              </div>
            </div>
          )}
          <Dialog open={!!createTarget} onOpenChange={(open) => { if (!open) closeCreateDialog() }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{createTarget?.type === 'directory' ? '新建文件夹' : '新建文件'}</DialogTitle>
                <DialogDescription>
                  {createTarget?.scope === 'workspace'
                    ? '创建到工作区文件目录，所有会话都可以访问。'
                    : '创建到当前会话文件目录，仅本会话可访问。'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Input
                  ref={createInputRef}
                  value={createName}
                  onChange={(event) => {
                    setCreateName(event.target.value)
                    setCreateError(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleCreateEntry()
                    }
                  }}
                  placeholder={createTarget?.type === 'directory' ? '文件夹名称' : '文件名，例如 notes.md'}
                  disabled={creatingEntry}
                />
                {createError && <p className="text-xs text-destructive">{createError}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={closeCreateDialog} disabled={creatingEntry}>
                  取消
                </Button>
                <Button type="button" onClick={() => { void handleCreateEntry() }} disabled={creatingEntry}>
                  创建
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
    </div>
  )
}

// ===== 附加文件容器 =====

interface AttachedFilesSectionProps {
  attachedFiles: string[]
  onDetach: (filePath: string) => void
  onAddToChat?: (entry: FileEntry) => void
  onFilePreview?: (filePath: string) => void
  allowedPaths?: string[]
  sessionId: string
}

function AttachedFilesSection({ attachedFiles, onDetach, onAddToChat, onFilePreview, allowedPaths, sessionId }: AttachedFilesSectionProps): React.ReactElement {
  return (
    <div className="pt-2.5 pb-1 flex-shrink-0">
      <div className="text-[11px] font-medium text-muted-foreground mb-1 px-3">附加文件（Agent 可以按原路径读取）</div>
      {attachedFiles.map((filePath) => {
        const name = getPathBasename(filePath)
        const entry: FileEntry = { name, path: filePath, isDirectory: false }
        return (
          <div
            key={filePath}
            className="flex items-center gap-1 py-1 pl-2 pr-2 text-sm cursor-pointer hover:bg-accent/50 group mx-2 rounded-lg"
            onClick={() => onFilePreview?.(filePath)}
          >
            <span className="w-3.5 flex-shrink-0" />
            <FileTypeIcon name={name} isDirectory={false} />
            <span className="text-xs truncate flex-1" title={filePath}>{name}</span>
            <div
              className="flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent/70 text-muted-foreground hover:text-foreground invisible group-hover:visible focus-visible:visible data-[state=open]:visible"
                    title="更多操作"
                    aria-label="更多操作"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 z-[9999] min-w-0 p-1.5">
                  {onAddToChat && (
                    <DropdownMenuItem
                      className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
                      onSelect={() => onAddToChat(entry)}
                    >
                      <MessageSquarePlus />
                      添加到聊天
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
                    onSelect={() => window.electronAPI.showAttachedInFolder(filePath, { sessionId, candidateBasePaths: allowedPaths }).catch(console.error)}
                  >
                    <FolderSearch />
                    在文件夹中显示
                  </DropdownMenuItem>
                  {onFilePreview && (
                    <DropdownMenuItem
                      className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
                      onSelect={() => onFilePreview(filePath)}
                    >
                      <ExternalLink />
                      打开文件
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-[13px] py-2 gap-3 rounded-md text-destructive focus:text-destructive [&>svg]:size-4"
                    onSelect={() => onDetach(filePath)}
                  >
                    <X />
                    移除附加
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ===== 附加目录容器（管理选中状态） =====

interface AttachedDirsSectionProps {
  attachedDirs: string[]
  onDetach: (dirPath: string) => void
  /** 文件版本号，用于自动刷新已展开的目录 */
  refreshVersion: number
  onFilesMoved?: () => void
  onDirectoryDropTargetActive?: () => void
  onAddToChat?: (entry: FileEntry) => void
  onFilePreview?: (filePath: string) => void
  /** 所有允许访问的路径（传给 IPC 做路径校验） */
  allowedPaths?: string[]
  sessionId: string
}

/** 附加目录区域：统一管理所有子项的选中状态 */
function AttachedDirsSection({ attachedDirs, onDetach, refreshVersion, onFilesMoved, onDirectoryDropTargetActive, onAddToChat, onFilePreview, allowedPaths, sessionId }: AttachedDirsSectionProps): React.ReactElement {
  const [selectedPaths, setSelectedPaths] = React.useState<Set<string>>(new Set())

  // ===== 接入搜索点击触发的 reveal：附加目录文件搜到后，需要展开/选中目标 =====
  const autoReveal = useAtomValue(fileBrowserAutoRevealAtom)
  // 找到 reveal target 命中的那个附加目录根。如果用户附加了嵌套目录（如同时附加 /a 和 /a/b），
  // 取"最深匹配"——只让真正包含该文件的最近一棵树展开，避免外层 /a 树被无谓打开。
  const revealRoot = React.useMemo(() => {
    if (!autoReveal) return null
    let best: string | null = null
    for (const dir of attachedDirs) {
      if (!isPathUnderRoot(dir, autoReveal.path)) continue
      if (!best || dir.length > best.length) best = dir
    }
    return best
  }, [autoReveal, attachedDirs])
  const revealTarget = revealRoot ? autoReveal!.path : null
  const revealTs = revealRoot ? autoReveal!.ts : 0
  const revealSelect = revealRoot ? !!autoReveal!.select : false

  // 命中本区域 + select=true：把目标加入选中态（与 FileBrowser 行为对齐）
  const consumedSelectTsRef = React.useRef(0)
  React.useEffect(() => {
    if (!revealSelect || !revealTarget || revealTs === 0) return
    if (revealTs <= consumedSelectTsRef.current) return
    consumedSelectTsRef.current = revealTs
    setSelectedPaths(new Set([revealTarget]))
  }, [revealTs, revealSelect, revealTarget])

  const handleSelect = React.useCallback((path: string, ctrlKey: boolean) => {
    setSelectedPaths((prev) => {
      if (ctrlKey) {
        // Ctrl+点击：切换选中
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
        }
        return next
      }
      // 普通点击：单选
      return new Set([path])
    })
  }, [])

  return (
    <div className="pt-2.5 pb-1 flex-shrink-0">
      <div className="text-[11px] font-medium text-muted-foreground mb-1 px-3">附加目录（Agent 可以读取并操作此外部文件夹）</div>
      {attachedDirs.map((dir) => {
        const isRevealRoot = dir === revealRoot
        return (
          <AttachedDirTree
            key={dir}
            dirPath={dir}
            onDetach={() => onDetach(dir)}
            selectedPaths={selectedPaths}
            onSelect={handleSelect}
            refreshVersion={refreshVersion}
            onFilesMoved={onFilesMoved}
            onDirectoryDropTargetActive={onDirectoryDropTargetActive}
            onAddToChat={onAddToChat}
            onFilePreview={onFilePreview}
            allowedPaths={allowedPaths}
            sessionId={sessionId}
            revealTarget={isRevealRoot ? revealTarget : null}
            revealTs={isRevealRoot ? revealTs : 0}
          />
        )
      })}
    </div>
  )
}

// ===== 附加目录树组件 =====

interface AttachedDirTreeProps {
  dirPath: string
  onDetach: () => void
  selectedPaths: Set<string>
  onSelect: (path: string, ctrlKey: boolean) => void
  refreshVersion: number
  onFilesMoved?: () => void
  onDirectoryDropTargetActive?: () => void
  onAddToChat?: (entry: FileEntry) => void
  onFilePreview?: (filePath: string) => void
  allowedPaths?: string[]
  sessionId: string
  /** 自动定位目标（仅当落在此 dirPath 之下时由父级传入，否则为 null） */
  revealTarget?: string | null
  /** 自动定位脉冲时间戳，变化时重新触发 */
  revealTs?: number
}

function AttachedDirTree({ dirPath, onDetach, selectedPaths, onSelect, refreshVersion, onFilesMoved, onDirectoryDropTargetActive, onAddToChat, onFilePreview, allowedPaths, sessionId, revealTarget = null, revealTs = 0 }: AttachedDirTreeProps): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const [children, setChildren] = React.useState<FileEntry[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [isDropTarget, setIsDropTarget] = React.useState(false)
  const rowRef = React.useRef<HTMLDivElement>(null)
  const dropExpandTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoExpandedByDragRef = React.useRef(false)
  const autoCollapseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const dirName = dirPath.split('/').filter(Boolean).pop() || dirPath

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

  // 计算从 dirPath 到 revealTarget 之间的祖先目录集合（用于子项决定是否自动展开）
  const revealAncestors = React.useMemo(
    () => revealTarget ? computeRevealAncestors(dirPath, revealTarget) : new Set<string>(),
    [dirPath, revealTarget],
  )

  // 当 refreshVersion 变化时，已展开的目录自动重新加载
  React.useEffect(() => {
    if (expanded && loaded) {
      window.electronAPI.listAttachedDirectory(dirPath, { sessionId, candidateBasePaths: allowedPaths })
        .then((items) => setChildren(items))
        .catch((err) => console.error('[AttachedDirTree] 刷新失败:', err))
    }
  }, [refreshVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 自动定位：reveal target 命中时自动加载子项 + 展开 =====
  React.useEffect(() => {
    if (revealTs === 0 || !revealTarget) return
    let cancelled = false
    const run = async (): Promise<void> => {
      if (!loaded) {
        try {
          const items = await window.electronAPI.listAttachedDirectory(dirPath, { sessionId, candidateBasePaths: allowedPaths })
          if (!cancelled) {
            setChildren(items)
            setLoaded(true)
          }
        } catch (err) {
          console.error('[AttachedDirTree] reveal 加载失败:', err)
          return
        }
      }
      if (!cancelled) setExpanded(true)
    }
    void run()
    return () => { cancelled = true }
  }, [revealTs]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadChildren = async (): Promise<FileEntry[]> => {
    const items = await window.electronAPI.listAttachedDirectory(dirPath, { sessionId, candidateBasePaths: allowedPaths })
    setChildren(items)
    setLoaded(true)
    return items
  }

  const expandDir = async (): Promise<void> => {
    if (!loaded) {
      try {
        await loadChildren()
      } catch (err) {
        console.error('[AttachedDirTree] 加载失败:', err)
        return
      }
    }
    setExpanded(true)
  }

  const toggleExpand = async (): Promise<void> => {
    if (!expanded && !loaded) {
      try {
        await loadChildren()
      } catch (err) {
        console.error('[AttachedDirTree] 加载失败:', err)
      }
    }
    setExpanded(!expanded)
  }

  // depth=0 的根行，与 FileBrowser 保持一致的布局：铺满、无外边距、可 sticky
  const { paddingLeft, guideLeft } = computeTreeRowLayout(0)
  const isSticky = expanded

  const handleDragOver = (event: React.DragEvent): void => {
    if (!eventHasFileTreeDrag(event)) return
    const payload = readFileTreeDragPayload(event)
    if (!payload) return
    const canDrop = payload.paths.some((path) => {
      if (normalizeFsPath(getParentPath(path)) === normalizeFsPath(dirPath)) return false
      return !isSameOrChildPath(path, dirPath)
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
    clearDropExpandTimer()
    setIsDropTarget(false)
    scheduleAutoCollapse()
  }

  const handleDrop = (event: React.DragEvent): void => {
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
      for (const path of Array.from(new Set(payload.paths))) {
        if (normalizeFsPath(getParentPath(path)) === normalizeFsPath(dirPath)) continue
        if (isSameOrChildPath(path, dirPath)) continue
        await window.electronAPI.moveAttachedFile(path, dirPath, { sessionId, candidateBasePaths: allowedPaths })
      }
      try {
        await loadChildren()
      } catch (err) {
        console.error('[AttachedDirTree] 拖拽移动后刷新失败:', err)
      }
      onFilesMoved?.()
    })().catch((err) => console.error('[AttachedDirTree] 拖拽移动失败:', err))
  }

  return (
    <div className="relative">
      <div
        ref={rowRef}
        data-sticky-row={isSticky ? 'true' : undefined}
        className={cn(
          'relative flex h-8 items-center gap-1 pr-2 text-sm cursor-pointer group transition-colors',
          isSticky && cn(STICKY_ROW_BASE_CLASS, 'top-0 z-10'),
          // sticky 行 hover 用不透明色，避免下方滚动内容透出；普通行保持半透明柔和感
          isSticky ? 'hover:bg-accent' : 'hover:bg-accent/50',
          isDropTarget && 'bg-primary/15 text-foreground shadow-sm ring-2 ring-primary/60 ring-inset',
        )}
        style={{ paddingLeft }}
        onClick={toggleExpand}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDropTarget && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 right-0 bg-primary/10"
          />
        )}
        <ChevronRight
          className={cn(
            'size-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-150',
            expanded && 'rotate-90',
          )}
        />
        <FileTypeIcon name={dirName} isDirectory isOpen={expanded} />
        <span className="text-xs truncate flex-1" title={dirPath}>
          {dirName}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          onClick={(e) => { e.stopPropagation(); onDetach() }}
        >
          <X className="size-3" />
        </Button>
      </div>
      {expanded && (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1 top-0 w-px bg-border/70"
            style={{ left: guideLeft }}
          />
          {children.length === 0 && loaded && (
            <div
              className="text-[11px] text-muted-foreground/50 py-1"
              style={{ paddingLeft: paddingLeft + 24 }}
            >
              空文件夹
            </div>
          )}
          {children.map((child) => (
            <AttachedDirItem key={child.path} entry={child} depth={1} selectedPaths={selectedPaths} onSelect={onSelect} refreshVersion={refreshVersion} onFilesMoved={onFilesMoved} onDirectoryDropTargetActive={onDirectoryDropTargetActive} onAddToChat={onAddToChat} onFilePreview={onFilePreview} allowedPaths={allowedPaths} sessionId={sessionId} revealTarget={revealTarget} revealTs={revealTs} revealAncestors={revealAncestors} />
          ))}
        </div>
      )}
    </div>
  )
}

interface AttachedDirItemProps {
  entry: FileEntry
  depth: number
  selectedPaths: Set<string>
  onSelect: (path: string, ctrlKey: boolean) => void
  refreshVersion: number
  onFilesMoved?: () => void
  onDirectoryDropTargetActive?: () => void
  onAddToChat?: (entry: FileEntry) => void
  onFilePreview?: (filePath: string) => void
  allowedPaths?: string[]
  sessionId: string
  /** 自动定位目标路径，命中则滚动到中心 */
  revealTarget?: string | null
  /** 自动定位脉冲时间戳，变化时重新触发 */
  revealTs?: number
  /** 祖先目录集合，命中则自动展开 */
  revealAncestors?: Set<string>
}

function AttachedDirItem({ entry, depth, selectedPaths, onSelect, refreshVersion, onFilesMoved, onDirectoryDropTargetActive, onAddToChat, onFilePreview, allowedPaths, sessionId, revealTarget = null, revealTs = 0, revealAncestors }: AttachedDirItemProps): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const [children, setChildren] = React.useState<FileEntry[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [isDropTarget, setIsDropTarget] = React.useState(false)
  // 重命名状态
  const [isRenaming, setIsRenaming] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState(entry.name)
  const renameInputRef = React.useRef<HTMLInputElement>(null)
  // 当前显示的名称和路径（重命名后更新）
  const [currentName, setCurrentName] = React.useState(entry.name)
  const [currentPath, setCurrentPath] = React.useState(entry.path)
  const rowRef = React.useRef<HTMLDivElement>(null)
  const dropExpandTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoExpandedByDragRef = React.useRef(false)
  const autoCollapseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const isSelected = selectedPaths.has(currentPath)

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

  // 当 refreshVersion 变化时，已展开的文件夹自动重新加载子项
  React.useEffect(() => {
    if (expanded && loaded && entry.isDirectory) {
      window.electronAPI.listAttachedDirectory(currentPath, { sessionId, candidateBasePaths: allowedPaths })
        .then((items) => setChildren(items))
        .catch((err) => console.error('[AttachedDirItem] 刷新子目录失败:', err))
    }
  }, [refreshVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 自动定位：祖先目录自动展开 + 目标行滚动到中心 =====
  React.useEffect(() => {
    if (revealTs === 0 || !revealTarget) return

    const isAncestor = !!revealAncestors && revealAncestors.has(currentPath)
    const isTarget = currentPath === revealTarget

    const scrollToTarget = (): void => {
      requestAnimationFrame(() => {
        rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }

    // 自身需要展开：祖先目录 OR 目标本身就是目录
    const willExpand = entry.isDirectory && (isAncestor || isTarget) && !expanded
    if (willExpand) {
      let cancelled = false
      const run = async (): Promise<void> => {
        if (!loaded) {
          try {
            const items = await window.electronAPI.listAttachedDirectory(currentPath, { sessionId, candidateBasePaths: allowedPaths })
            if (!cancelled) {
              setChildren(items)
              setLoaded(true)
            }
          } catch (err) {
            console.error('[AttachedDirItem] reveal 加载子目录失败:', err)
            return
          }
        }
        if (cancelled) return
        setExpanded(true)
        // 目标自身就是这个目录时，等展开成功后再滚动，避免子项渲染改变行高使
        // smooth scroll 偏离；加载失败路径自然跳过滚动。
        if (isTarget) scrollToTarget()
      }
      void run()
      return () => { cancelled = true }
    }

    // 目标行：滚动到可视区中心（不打 flash，直接靠选中态高亮）
    if (isTarget) scrollToTarget()
  }, [revealTs]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadChildren = async (): Promise<FileEntry[]> => {
    const items = await window.electronAPI.listAttachedDirectory(currentPath, { sessionId, candidateBasePaths: allowedPaths })
    setChildren(items)
    setLoaded(true)
    return items
  }

  const expandDir = async (): Promise<void> => {
    if (!entry.isDirectory) return
    if (!loaded) {
      try {
        await loadChildren()
      } catch (err) {
        console.error('[AttachedDirItem] 加载子目录失败:', err)
        return
      }
    }
    setExpanded(true)
  }

  const toggleDir = async (): Promise<void> => {
    if (!entry.isDirectory) return
    if (!expanded && !loaded) {
      try {
        await loadChildren()
      } catch (err) {
        console.error('[AttachedDirItem] 加载子目录失败:', err)
      }
    }
    setExpanded(!expanded)
  }

  const handleClick = (e: React.MouseEvent): void => {
    const isMulti = e.ctrlKey || e.metaKey
    onSelect(currentPath, isMulti)
    if (isMulti) return
    if (entry.isDirectory) {
      void toggleDir()
    } else {
      onFilePreview?.(currentPath)
    }
  }

  // 开始重命名
  const startRename = (): void => {
    setRenameValue(currentName)
    setIsRenaming(true)
    // 延迟聚焦，等待 DOM 渲染
    setTimeout(() => renameInputRef.current?.select(), 50)
  }

  // 确认重命名
  const confirmRename = async (): Promise<void> => {
    const newName = renameValue.trim()
    if (!newName || newName === currentName) {
      setIsRenaming(false)
      return
    }
    try {
      await window.electronAPI.renameAttachedFile(currentPath, newName, { sessionId, candidateBasePaths: allowedPaths })
      // 更新本地显示
      const parentDir = currentPath.substring(0, currentPath.lastIndexOf('/'))
      const newPath = `${parentDir}/${newName}`
      // 更新选中状态中的路径
      onSelect(newPath, false)
      setCurrentName(newName)
      setCurrentPath(newPath)
    } catch (err) {
      console.error('[AttachedDirItem] 重命名失败:', err)
    }
    setIsRenaming(false)
  }

  // 取消重命名
  const cancelRename = (): void => {
    setIsRenaming(false)
    setRenameValue(currentName)
  }

  // 移动到文件夹
  const handleMove = async (): Promise<void> => {
    try {
      const result = await window.electronAPI.openFolderDialog()
      if (!result) return
      await window.electronAPI.moveAttachedFile(currentPath, result.path, { sessionId, candidateBasePaths: allowedPaths })
      // 移动后更新路径
      const newPath = `${result.path}/${currentName}`
      setCurrentPath(newPath)
    } catch (err) {
      console.error('[AttachedDirItem] 移动失败:', err)
    }
  }

  const { paddingLeft, guideLeft, stickyTop, stickyZIndex } = computeTreeRowLayout(depth)
  const isSticky = entry.isDirectory && expanded && canBeSticky(depth)

  const handleDragOver = (event: React.DragEvent): void => {
    if (!entry.isDirectory || !eventHasFileTreeDrag(event)) return
    const payload = readFileTreeDragPayload(event)
    if (!payload) return
    const canDrop = payload.paths.some((path) => {
      if (normalizeFsPath(getParentPath(path)) === normalizeFsPath(currentPath)) return false
      return !isSameOrChildPath(path, currentPath)
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
    clearDropExpandTimer()
    setIsDropTarget(false)
    scheduleAutoCollapse()
  }

  const handleDrop = (event: React.DragEvent): void => {
    if (!entry.isDirectory) return
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
      for (const path of Array.from(new Set(payload.paths))) {
        if (normalizeFsPath(getParentPath(path)) === normalizeFsPath(currentPath)) continue
        if (isSameOrChildPath(path, currentPath)) continue
        await window.electronAPI.moveAttachedFile(path, currentPath, { sessionId, candidateBasePaths: allowedPaths })
      }
      try {
        await loadChildren()
      } catch (err) {
        console.error('[AttachedDirItem] 拖拽移动后刷新失败:', err)
      }
      onFilesMoved?.()
    })().catch((err) => console.error('[AttachedDirItem] 拖拽移动失败:', err))
  }

  return (
    <>
      <div
        ref={rowRef}
        data-sticky-row={isSticky ? 'true' : undefined}
        className={cn(
          'relative flex h-8 items-center gap-1 pr-2 text-sm cursor-pointer group transition-colors',
          isSticky && STICKY_ROW_BASE_CLASS,
          // sticky 行 hover 用不透明色，避免下方滚动内容透出；普通行保持半透明柔和感
          isSelected
            ? 'bg-accent'
            : isSticky
              ? 'hover:bg-accent'
              : 'hover:bg-accent/50',
          isDropTarget && 'bg-primary/15 text-foreground shadow-sm ring-2 ring-primary/60 ring-inset',
        )}
        style={{
          paddingLeft,
          top: isSticky ? stickyTop : undefined,
          zIndex: isSticky ? stickyZIndex : undefined,
        }}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDropTarget && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 right-0 bg-primary/10"
          />
        )}
        {/* sticky 行祖先链竖线，逻辑见 tree-row-layout.tsx 的 AncestorGuides。
            选中态下 bg-accent 不透明背景会盖住原 border 色，组件内部已切到 accent-foreground。 */}
        {isSticky && <AncestorGuides depth={depth} isSelected={isSelected} />}
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
        <FileTypeIcon name={currentName} isDirectory={entry.isDirectory} isOpen={expanded} />

        {/* 名称：正常显示 / 重命名输入框 */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="text-xs flex-1 min-w-0 bg-background border border-primary rounded px-1 py-0.5 outline-none"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename()
              if (e.key === 'Escape') cancelRename()
              e.stopPropagation()
            }}
            onBlur={confirmRename}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate text-xs flex-1">{currentName}</span>
        )}

        {/* 右侧操作按钮占位 */}
        <div
          className="flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 悬浮/选中状态：三点菜单 */}
          {!isRenaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'h-6 w-6 rounded flex items-center justify-center hover:bg-accent/70 text-muted-foreground hover:text-foreground',
                  !isSelected && 'invisible group-hover:visible focus-visible:visible data-[state=open]:visible',
                )}
                title="更多操作"
                aria-label="更多操作"
                onClick={() => {
                  if (!isSelected) onSelect(currentPath, false)
                }}
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48 z-[9999] min-w-0 p-1.5">
                {onAddToChat && !entry.isDirectory && (
                  <DropdownMenuItem
                    className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
                    onSelect={() => onAddToChat({ ...entry, path: currentPath, name: currentName })}
                  >
                    <MessageSquarePlus />
                    添加到聊天
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
                  onSelect={() => window.electronAPI.showAttachedInFolder(currentPath, { sessionId, candidateBasePaths: allowedPaths }).catch(console.error)}
                >
                  <FolderSearch />
                  在文件夹中显示
                </DropdownMenuItem>
                {!entry.isDirectory && onFilePreview && (
                  <DropdownMenuItem
                    className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
                    onSelect={() => onFilePreview(currentPath)}
                  >
                    <ExternalLink />
                    打开文件
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
                  onSelect={startRename}
                >
                  <Pencil />
                  重命名
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-[13px] py-2 gap-3 rounded-md [&>svg]:size-4"
                  onSelect={handleMove}
                >
                  <FolderInput />
                  移动到...
                </DropdownMenuItem>
              </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </div>
      {expanded && (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1 top-0 w-px bg-border/70"
            style={{ left: guideLeft }}
          />
          {children.length === 0 && loaded && (
            <div
              className="text-[11px] text-muted-foreground/50 py-1"
              style={{ paddingLeft: paddingLeft + 24 }}
            >
              空文件夹
            </div>
          )}
          {children.map((child) => (
            <AttachedDirItem key={child.path} entry={child} depth={depth + 1} selectedPaths={selectedPaths} onSelect={onSelect} refreshVersion={refreshVersion} onFilesMoved={onFilesMoved} onDirectoryDropTargetActive={onDirectoryDropTargetActive} onAddToChat={onAddToChat} onFilePreview={onFilePreview} allowedPaths={allowedPaths} sessionId={sessionId} revealTarget={revealTarget} revealTs={revealTs} revealAncestors={revealAncestors} />
          ))}
        </div>
      )}
    </>
  )
}
