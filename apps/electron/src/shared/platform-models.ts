/** 平台模型信息（与服务端 /workmate/models 返回一致） */
export interface PlatformModelInfo {
  id: string
  name: string
  description?: string
  provider?: string
  /** 模型调用地址 */
  baseUrl?: string
  maxTokens?: number
  supportsMultimodal?: boolean
  enabled: boolean
}

/** 服务端响应 */
export interface PlatformModelsResponse {
  apiKey: string
  models: PlatformModelInfo[]
  total: number
}

/** 磁盘缓存结构 */
export interface ModelsCache {
  encryptedApiKey?: string
  apiKey?: string
  models: PlatformModelInfo[]
  total: number
  cachedAt: number
  jobId?: string
}

/** IPC 通道名称常量 */
export const PLATFORM_MODELS_IPC_CHANNELS = {
  FETCH: 'platform-models:fetch',
  GET_CACHED: 'platform-models:get-cached',
  GET_API_KEY: 'platform-models:get-api-key',
} as const