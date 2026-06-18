/**
 * 泰为平台模型 — 类型定义
 *
 * 后端 /workmate/models 接口返回的模型数据结构。
 * 后端字段名 supportVision 在 model-service.ts 中映射为 supportsMultimodal。
 */

/** 模型信息 */
export interface ModelInfo {
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
