/**
 * 使用手册 Jotai 状态管理
 */

import { atom } from 'jotai'
import type { ManualContent } from '@proma/shared'

/** 手册面板是否打开 */
export const manualPanelOpenAtom = atom<boolean>(false)

/** 手册内容 */
export const manualContentAtom = atom<ManualContent | null>(null)

/** 是否正在加载 */
export const manualLoadingAtom = atom<boolean>(false)

/** 加载错误信息（静默降级时为空） */
export const manualErrorAtom = atom<string | null>(null)
