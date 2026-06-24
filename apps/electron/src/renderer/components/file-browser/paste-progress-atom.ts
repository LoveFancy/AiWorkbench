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
