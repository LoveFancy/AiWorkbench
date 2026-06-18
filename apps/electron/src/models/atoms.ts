/**
 * 泰为平台模型 — Jotai atoms（渲染进程）
 *
 * - modelsAtom：平台模型列表
 * - apiKeyAtom：平台统一 API Key
 * - modelsLoadingAtom：加载状态
 */

import { atom } from 'jotai'
import type { ModelInfo } from './types'

export const modelsAtom = atom<ModelInfo[]>([])
export const apiKeyAtom = atom<string | null>(null)
export const modelsLoadingAtom = atom<boolean>(false)
