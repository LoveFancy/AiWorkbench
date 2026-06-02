import { config } from '../config'
import { logger } from '../utils/logger'
import type { ModelInfo } from '../types'

interface ModelPlatformResponse {
  models: Array<{
    id: string
    name: string
    description?: string
    provider?: string
    maxTokens?: number
    enabled: boolean
  }>
}

export async function getUserModels(userId: string): Promise<ModelInfo[]> {
  const url = `${config.modelPlatformApiUrl}/users/${userId}/models`

  logger.info('查询用户模型列表', { userId, url })

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.modelPlatformTimeoutMs)

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      logger.error('大模型平台返回错误', { status: response.status, userId })
      return []
    }

    const data: ModelPlatformResponse = await response.json()
    return data.models.filter((m) => m.enabled)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('大模型平台请求超时', { userId })
    } else {
      logger.error('查询大模型平台失败', { error, userId })
    }
    return []
  }
}