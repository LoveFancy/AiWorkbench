import { atom } from 'jotai'
import type { PlatformModelInfo } from '../../shared/platform-models'

export type { PlatformModelInfo, PlatformModelsResponse } from '../../shared/platform-models'

export const platformModelsAtom = atom<PlatformModelInfo[]>([])
export const platformApiKeyAtom = atom<string | null>(null)
export const platformModelsLoadingAtom = atom<boolean>(false)
export const platformModelsLastFetchAtom = atom<number>(0)