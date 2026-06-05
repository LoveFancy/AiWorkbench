import { ipcMain } from 'electron'
import { fetchUserModels, getModels, getApiKey, clearCache } from './model-service'

export const MODELS_IPC_CHANNELS = {
  FETCH_MODELS: 'models:fetch',
  GET_MODELS: 'models:get-models',
  GET_API_KEY: 'models:get-api-key',
  CLEAR_CACHE: 'models:clear-cache',
} as const

export function registerModelsIpcHandlers(): void {
  ipcMain.handle(MODELS_IPC_CHANNELS.FETCH_MODELS, async (_event, forceRefresh?: boolean) => {
    return fetchUserModels(forceRefresh)
  })

  ipcMain.handle(MODELS_IPC_CHANNELS.GET_MODELS, () => {
    return getModels()
  })

  ipcMain.handle(MODELS_IPC_CHANNELS.GET_API_KEY, () => {
    return getApiKey()
  })

  ipcMain.handle(MODELS_IPC_CHANNELS.CLEAR_CACHE, () => {
    clearCache()
  })
}
