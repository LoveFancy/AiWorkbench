/**
 * 泰为平台模型 — 模块入口
 *
 * 统一导出主进程、preload、渲染进程、类型等所有子模块。
 * 通过 modelsAtom / apiKeyAtom 在渲染进程中使用。
 */

// 主进程
export { fetchUserModels, getModels, getApiKey, clearCache, loadCacheFromDisk, initModelRefresh, shutdownModelRefresh } from './model-service'
export { registerModelsIpcHandlers, MODELS_IPC_CHANNELS } from './ipc-handlers'

// preload
export { createModelsPreloadApi } from './preload-bridge'
export type { ModelsElectronAPI } from './preload-bridge'

// 渲染进程
export { modelsAtom, apiKeyAtom, modelsLoadingAtom } from './atoms'

// 类型
export type { ModelInfo, ModelListResponse, ModelsCache } from './types'
