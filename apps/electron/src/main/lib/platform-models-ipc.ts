import { ipcMain } from 'electron'
import { fetchUserModels, getModels, getApiKey } from './platform-models-service'
import { PLATFORM_MODELS_IPC_CHANNELS } from '../../shared/platform-models'

export { PLATFORM_MODELS_IPC_CHANNELS }

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