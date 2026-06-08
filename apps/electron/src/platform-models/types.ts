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
