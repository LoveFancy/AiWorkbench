/** 模型信息 */
export interface ModelInfo {
  id: string
  name: string
  description?: string
  provider?: string
  /** 模型调用地址 */
  baseUrl?: string
  maxTokens?: number
  enabled: boolean
}

/** 模型列表响应（服务端返回） */
export interface ModelListResponse {
  apiKey: string
  models: ModelInfo[]
  total: number
}

/** 磁盘缓存结构 */
export interface ModelsCache {
  encryptedApiKey?: string
  apiKey?: string
  models: ModelInfo[]
  total: number
  cachedAt: number
  jobId?: string
}
