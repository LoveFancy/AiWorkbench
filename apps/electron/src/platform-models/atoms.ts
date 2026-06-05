import { atom } from 'jotai'
import type { PlatformModelInfo } from './types'

export const platformModelsAtom = atom<PlatformModelInfo[]>([])
export const platformApiKeyAtom = atom<string | null>(null)
export const platformModelsLoadingAtom = atom<boolean>(false)
export const platformModelsLastFetchAtom = atom<number>(0)
