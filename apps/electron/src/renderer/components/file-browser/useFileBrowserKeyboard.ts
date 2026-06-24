/**
 * useFileBrowserKeyboard — 文件树键盘快捷键 hook
 *
 * 抽取自 FileBrowser.tsx 的 handleKeyDown 逻辑，独立管理键盘交互关注点。
 * 使用 ref 稳定大部分依赖引用，避免父组件频繁重建回调。
 */

import * as React from 'react'
import type { FileEntry } from '@proma/shared'
import type { FileClipboard } from '@/atoms/file-clipboard-atoms'

interface UseFileBrowserKeyboardParams {
  renamingPath: string | null
  selectedPaths: Set<string>
  entries: FileEntry[]
  /** 可见节点元信息 Map，供键盘操作查找 isDirectory / name */
  entryMetaMapRef: React.RefObject<Map<string, { name: string; isDirectory: boolean }>>
  copyOrCutToClipboard: (mode: 'copy' | 'cut') => void
  handleRequestDelete: (entry: FileEntry) => void
  setRenamingPath: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedPaths: React.Dispatch<React.SetStateAction<Set<string>>>
  setFileClipboard: (clipboard: FileClipboard | null) => void
  setKeyboardToggleSignal: React.Dispatch<React.SetStateAction<{ path: string; ts: number } | null>>
  onSelectedDirectoryChange?: (dirPath: string | null) => void
  onFilePreview?: (filePath: string) => void
  clearSelection: () => void
  /** 多选删除触发（Delete键，selectedPaths.size > 1 时调用） */
  onRequestMultiDelete?: () => void
}

export function useFileBrowserKeyboard({
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
  onRequestMultiDelete,
}: UseFileBrowserKeyboardParams): React.KeyboardEventHandler<HTMLDivElement> {
  const selectedPathsRef = React.useRef(selectedPaths)
  selectedPathsRef.current = selectedPaths

  const entriesRef = React.useRef(entries)
  entriesRef.current = entries

  const metaMapRef = entryMetaMapRef

  const handleRequestDeleteRef = React.useRef(handleRequestDelete)
  handleRequestDeleteRef.current = handleRequestDelete

  const copyOrCutToClipboardRef = React.useRef(copyOrCutToClipboard)
  copyOrCutToClipboardRef.current = copyOrCutToClipboard

  const clearSelectionRef = React.useRef(clearSelection)
  clearSelectionRef.current = clearSelection

  const setFileClipboardRef = React.useRef(setFileClipboard)
  setFileClipboardRef.current = setFileClipboard

  const onFilePreviewRef = React.useRef(onFilePreview)
  onFilePreviewRef.current = onFilePreview

  const onSelectedDirectoryChangeRef = React.useRef(onSelectedDirectoryChange)
  onSelectedDirectoryChangeRef.current = onSelectedDirectoryChange

  const onRequestMultiDeleteRef = React.useRef(onRequestMultiDelete)
  onRequestMultiDeleteRef.current = onRequestMultiDelete

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (renamingPath) return
    if (e.nativeEvent.isComposing) return

    const isMac = navigator.userAgent.includes('Mac')
    const isMod = isMac ? e.metaKey : e.ctrlKey
    const isDeleteKey = e.key === 'Delete' || (isMac && e.key === 'Backspace')

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

    if (isMod && e.key === 'c' && selectedPathsRef.current.size > 0) {
      e.preventDefault()
      e.stopPropagation()
      copyOrCutToClipboardRef.current('copy')
      return
    }

    if (isMod && e.key === 'x' && selectedPathsRef.current.size > 0) {
      e.preventDefault()
      e.stopPropagation()
      copyOrCutToClipboardRef.current('cut')
      return
    }

    if (e.key === 'F2' && selectedPathsRef.current.size === 1) {
      e.preventDefault()
      setRenamingPath([...selectedPathsRef.current][0]!)
      return
    }

    if (isMod && e.key === 'a') {
      e.preventDefault()
      e.stopPropagation()
      setSelectedPaths(new Set(entriesRef.current.map(item => item.path)))
      onSelectedDirectoryChangeRef.current?.(null)
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      clearSelectionRef.current()
      setFileClipboardRef.current(null)
      return
    }

    if (e.key === 'Enter' && selectedPathsRef.current.size === 1) {
      e.preventDefault()
      const path = [...selectedPathsRef.current][0]!
      const meta = metaMapRef.current?.get(path)
      if (!meta) return
      if (meta.isDirectory) {
        setKeyboardToggleSignal({ path, ts: Date.now() })
      } else {
        onFilePreviewRef.current?.(path)
      }
      return
    }
  }, [renamingPath, setRenamingPath, setSelectedPaths, setKeyboardToggleSignal, metaMapRef])

  return handleKeyDown
}
