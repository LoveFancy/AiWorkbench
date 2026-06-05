import { atom } from 'jotai'
import type { ModelInfo } from './types'

export const modelsAtom = atom<ModelInfo[]>([])
export const apiKeyAtom = atom<string | null>(null)
export const modelsLoadingAtom = atom<boolean>(false)
