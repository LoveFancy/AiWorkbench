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

interface CredentialsResponse {
  apiKey: string
  models: Array<{
    id: string
    name: string
    description?: string
    provider?: string
    maxTokens?: number
    enabled: boolean
  }>
}

export interface UserCredentials {
  apiKey: string
  models: ModelInfo[]
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

    const data = await response.json() as ModelPlatformResponse
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

/**
 * 查询用户 API Key 与模型列表
 *
 * 大模型平台返回 { apiKey, models } 结构，model-platform.service 过滤 enabled=false 后返回。
 */
export async function getUserCredentials(userId: string): Promise<UserCredentials> {
  const url = `${config.modelPlatformApiUrl}/users/${userId}/credentials`

  logger.info('查询用户凭证和模型列表', { userId, url })

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
      return { apiKey: '', models: [] }
    }

    const data = await response.json() as CredentialsResponse
    return {
      apiKey: data.apiKey ?? '',
      models: (data.models ?? []).filter((m) => m.enabled),
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('大模型平台请求超时', { userId })
    } else {
      logger.error('查询大模型平台失败', { error, userId })
    }
    return { apiKey: '', models: [] }
  }
}