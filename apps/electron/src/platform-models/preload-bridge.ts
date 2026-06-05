import { ipcRenderer } from 'electron'
import { PLATFORM_MODELS_IPC_CHANNELS } from './ipc-handlers'
import type { PlatformModelsResponse, PlatformModelInfo } from './types'

export interface PlatformModelsElectronAPI {
  fetchModels: (forceRefresh?: boolean) => Promise<PlatformModelsResponse>
  getCachedModels: () => Promise<{ models: PlatformModelInfo[]; apiKey: string | null }>
  getApiKey: () => Promise<string | null>
}

export function createPlatformModelsPreloadApi(): { platformModels: PlatformModelsElectronAPI } {
  return {
    platformModels: {
      fetchModels: (forceRefresh?) =>
        ipcRenderer.invoke(PLATFORM_MODELS_IPC_CHANNELS.FETCH, forceRefresh),
      getCachedModels: () =>
        ipcRenderer.invoke(PLATFORM_MODELS_IPC_CHANNELS.GET_CACHED),
      getApiKey: () =>
        ipcRenderer.invoke(PLATFORM_MODELS_IPC_CHANNELS.GET_API_KEY),
    },
  }
}
