import { atom } from 'jotai'

/** 文件剪贴板状态（应用内虚拟剪贴板，跨 FileBrowser 实例共享） */
export interface FileClipboard {
  /** 剪贴板中的文件路径列表 */
  paths: string[]
  /** 操作模式：copy 复制 / cut 剪切 */
  mode: 'copy' | 'cut'
  /** 来源根路径 */
  sourceRoot: string
}

export const fileClipboardAtom = atom<FileClipboard | null>(null)
