import { ipcRenderer } from 'electron'
import { MODELS_IPC_CHANNELS } from './ipc-handlers'
import type { ModelListResponse, ModelInfo } from './types'

export interface ModelsElectronAPI {
  fetchModels: (forceRefresh?: boolean) => Promise<ModelListResponse>
  getApiKey: () => Promise<string | null>
  getModels: () => Promise<ModelInfo[]>
  clearCache: () => Promise<void>
}

export function createModelsPreloadApi(): { models: ModelsElectronAPI } {
  return {
    models: {
      fetchModels: (forceRefresh?) =>
        ipcRenderer.invoke(MODELS_IPC_CHANNELS.FETCH_MODELS, forceRefresh),
      getApiKey: () =>
        ipcRenderer.invoke(MODELS_IPC_CHANNELS.GET_API_KEY),
      getModels: () =>
        ipcRenderer.invoke(MODELS_IPC_CHANNELS.GET_MODELS),
      clearCache: () =>
        ipcRenderer.invoke(MODELS_IPC_CHANNELS.CLEAR_CACHE),
    },
  }
}
