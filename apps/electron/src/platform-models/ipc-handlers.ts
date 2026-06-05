import { ipcMain } from 'electron'
import { fetchUserModels, getModels, getApiKey } from '../models/model-service'

export const PLATFORM_MODELS_IPC_CHANNELS = {
  FETCH: 'platform-models:fetch',
  GET_CACHED: 'platform-models:get-cached',
  GET_API_KEY: 'platform-models:get-api-key',
} as const

export function registerPlatformModelsIpcHandlers(): void {
  ipcMain.handle(PLATFORM_MODELS_IPC_CHANNELS.FETCH, async (_event, forceRefresh?: boolean) => {
    return fetchUserModels(forceRefresh)
  })

  ipcMain.handle(PLATFORM_MODELS_IPC_CHANNELS.GET_CACHED, () => {
    return {
      models: getModels(),
      apiKey: getApiKey(),
    }
  })

  ipcMain.handle(PLATFORM_MODELS_IPC_CHANNELS.GET_API_KEY, () => {
    return getApiKey()
  })
}
