/**
 * 文件树拖拽工具 — 与文件树拖拽相关的常量、类型和辅助函数
 *
 * 从 FileBrowser.tsx 抽取，供 FileBrowser 和 FileTreeItem 共用，
 * 避免循环依赖。
 */

import * as React from 'react'

export const FILE_TREE_DRAG_MIME = 'application/x-proma-file-tree-entry'

export type FileTreeDragPayload = {
  paths: string[]
}

export function readFileTreeDragPayload(event: React.DragEvent): FileTreeDragPayload | null {
  const raw = event.dataTransfer.getData(FILE_TREE_DRAG_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<FileTreeDragPayload>
    const paths = Array.isArray(parsed.paths)
      ? parsed.paths.filter((path): path is string => typeof path === 'string' && path.length > 0)
      : []
    return paths.length > 0 ? { paths } : null
  } catch {
    return null
  }
}

export function eventHasFileTreeDrag(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(FILE_TREE_DRAG_MIME)
}

export function eventHasExternalFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export function isPointerInsideElement(event: React.DragEvent, element: HTMLElement | null): boolean {
  if (!element) return false
  const rect = element.getBoundingClientRect()
  return event.clientX >= rect.left
    && event.clientX <= rect.right
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom
}
