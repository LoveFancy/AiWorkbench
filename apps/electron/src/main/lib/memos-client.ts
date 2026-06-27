/**
 * MemOS 本地服务 HTTP 客户端
 *
 * 主进程内直接调用本地 MemOS 服务 API。
 * 提供 createCube（创建个人记忆）、searchMemory（搜索记忆）、queryCube（查询个人记忆内容）和 addMemory（存储记忆）四个核心方法。
 */

import { getMemoryConfig } from './memory-service'

/** MemOS 默认服务地址（可由记忆配置中的 serverUrl 覆盖） */
export const DEFAULT_MEMOS_SERVER_URL = 'http://168.64.22.211:8000'

const API_PREFIX = '/product'
/** MemOS 请求超时（毫秒）：Agent 模式下 MemOS 可能需要更长时间处理 */
const TIMEOUT_MS = 30000
const RETRIES = 1

/** 记忆凭据 */
export interface MemosCredentials {
  /** 个人记忆 ID（由 createCube 创建后返回） */
  cubeId: string
  /** 个人记忆所属用户 ID */
  ownerId: string
}

/** 搜索记忆的结果 */
export interface MemorySearchResult {
  facts: Array<{
    id: string
    text: string
    createTime?: string
    confidence?: number
  }>
  preferences: Array<{
    id: string
    text: string
    type?: string
  }>
}

// ===== 内部工具函数 =====

function getBaseUrl(): string {
  const config = getMemoryConfig()
  const url = config.serverUrl || DEFAULT_MEMOS_SERVER_URL
  return url.replace(/\/+$/, '')
}

async function callApi(
  _credentials: MemosCredentials,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const baseUrl = getBaseUrl()
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      const res = await fetch(`${baseUrl}${API_PREFIX}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) {
        const text = await res.text()
        console.error(`[记忆服务] API 请求失败 HTTP ${res.status}: ${text}`)
        throw new Error(`HTTP ${res.status}: ${text}`)
      }
      return await res.json()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < RETRIES) {
        console.log(`[记忆服务] 请求重试 (${attempt + 1}/${RETRIES}): ${path}`)
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)))
      }
    }
  }
  throw lastError!
}

// ===== 创建个人记忆 =====

/**
 * 创建个人记忆
 */
export async function createCube(
  params: { cubeName: string; ownerId: string },
): Promise<{ cubeId: string; cubeName: string; ownerId: string }> {
  console.log(`[记忆服务] ⏳ 正在创建个人记忆 name="${params.cubeName}" owner="${params.ownerId}"`)

  const result = await callApi({ cubeId: '', ownerId: '' }, '/create_cube', {
    cube_name: params.cubeName,
    owner_id: params.ownerId,
  })

  const r = result as Record<string, unknown>
  if (r.code !== 200) {
    throw new Error(`创建个人记忆失败: ${String(r.message ?? '未知错误')}`)
  }

  const data = r.data as Record<string, string> | undefined
  if (!data?.cube_id) {
    throw new Error('创建个人记忆失败: 响应中缺少 cube_id')
  }

  console.log(`[记忆服务] ✅ 个人记忆创建成功 cubeId=${data.cube_id}`)
  return {
    cubeId: data.cube_id,
    cubeName: data.cube_name ?? params.cubeName,
    ownerId: data.owner_id ?? params.ownerId,
  }
}

// ===== 搜索记忆 =====

function extractMemoriesFromBuckets(
  buckets: Array<Record<string, unknown>> | undefined,
): Array<{ id: string; text: string; createTime?: string; confidence?: number }> {
  if (!buckets || !Array.isArray(buckets)) return []
  const items: Array<{ id: string; text: string; createTime?: string; confidence?: number }> = []
  for (const bucket of buckets) {
    const memories = bucket.memories as Array<Record<string, unknown>> | undefined
    if (!memories || !Array.isArray(memories)) continue
    for (const mem of memories) {
      const metadata = (mem.metadata as Record<string, unknown>) ?? {}
      items.push({
        id: String(mem.id ?? ''),
        text: String(mem.memory ?? ''),
        createTime: metadata.create_time ? String(metadata.create_time) : undefined,
        confidence: typeof metadata.score === 'number' ? metadata.score : undefined,
      })
    }
  }
  return items.filter((f) => f.text)
}

function extractPreferencesFromBuckets(
  buckets: Array<Record<string, unknown>> | undefined,
): Array<{ id: string; text: string; type?: string }> {
  if (!buckets || !Array.isArray(buckets)) return []
  const items: Array<{ id: string; text: string; type?: string }> = []
  for (const bucket of buckets) {
    const memories = bucket.memories as Array<Record<string, unknown>> | undefined
    if (!memories || !Array.isArray(memories)) continue
    for (const mem of memories) {
      const metadata = (mem.metadata as Record<string, unknown>) ?? {}
      items.push({
        id: String(mem.id ?? ''),
        text: String(mem.memory ?? ''),
        type: metadata.preference_type ? String(metadata.preference_type) : undefined,
      })
    }
  }
  return items.filter((p) => p.text)
}

/**
 * 搜索记忆
 */
export async function searchMemory(
  credentials: MemosCredentials,
  query: string,
  limit = 6,
): Promise<MemorySearchResult> {
  console.log(`[记忆服务] 🔍 搜索记忆 query="${query}", cubeId=${credentials.cubeId}`)

  const result = await callApi(credentials, '/search', {
    query,
    user_id: credentials.ownerId,
    readable_cube_ids: [credentials.cubeId],
    top_k: limit,
    include_preference: true,
    pref_top_k: limit,
    relativity: 0,
    mode: 'fast',
  })

  const r = result as Record<string, unknown>
  const data = r.data as Record<string, unknown> | undefined

  if (!data) {
    console.log('[记忆服务] 📊 搜索未返回数据')
    return { facts: [], preferences: [] }
  }

  const textBuckets = data.text_mem as Array<Record<string, unknown>> | undefined
  const prefBuckets = data.pref_mem as Array<Record<string, unknown>> | undefined

  const facts = extractMemoriesFromBuckets(textBuckets)
  const preferences = extractPreferencesFromBuckets(prefBuckets)

  console.log(`[记忆服务] 📊 搜索命中 ${facts.length} 条事实, ${preferences.length} 条偏好`)
  return { facts, preferences }
}

/**
 * 格式化搜索结果为文本（供工具返回给 agent）
 */
export function formatSearchResult(result: MemorySearchResult): string {
  const lines: string[] = []
  if (result.facts.length > 0) {
    lines.push('## Facts')
    for (const item of result.facts) {
      const time = item.createTime ? new Date(item.createTime).toLocaleString() : ''
      lines.push(time ? `- [${time}] ${item.text}` : `- ${item.text}`)
    }
  }
  if (result.preferences.length > 0) {
    lines.push('\n## Preferences')
    for (const item of result.preferences) {
      lines.push(item.type ? `- (${item.type}) ${item.text}` : `- ${item.text}`)
    }
  }
  return lines.length > 0 ? lines.join('\n') : 'No memories found.'
}

// ===== 添加记忆 =====

/**
 * 存储记忆
 */
export async function addMemory(
  credentials: MemosCredentials,
  params: {
    userMessage: string
    assistantMessage?: string
    conversationId?: string
    tags?: string[]
  },
): Promise<void> {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'user', content: params.userMessage },
  ]
  if (params.assistantMessage) {
    messages.push({ role: 'assistant', content: params.assistantMessage })
  }

  const conversationId = params.conversationId || `proma-${Date.now()}`
  console.log(`[记忆服务] 💾 添加记忆 conversationId=${conversationId}`)

  await callApi(credentials, '/add', {
    user_id: credentials.ownerId,
    writable_cube_ids: [credentials.cubeId],
    messages,
    async_mode: 'sync',
    custom_tags: params.tags ?? ['proma'],
    info: { source: 'proma-builtin', conversation_id: conversationId },
  })

  console.log(`[记忆服务] ✅ 添加记忆完成 conversationId=${conversationId}`)
}

// ===== 查询个人记忆内容 =====

/**
 * 查询个人记忆的偏好和事实
 */
export async function queryCube(
  credentials: MemosCredentials,
): Promise<import('@proma/shared').QueryCubeResult> {
  console.log(`[记忆服务] 🔍 查询个人记忆 cubeId=${credentials.cubeId}`)

  // 用一个通用查询来获取偏好和事实
  const result = await callApi(credentials, '/search', {
    query: '.',
    user_id: credentials.ownerId,
    readable_cube_ids: [credentials.cubeId],
    top_k: 20,
    include_preference: true,
    pref_top_k: 20,
    relativity: 0,
  })

  const r = result as Record<string, unknown>
  const data = r.data as Record<string, unknown> | undefined

  if (!data) {
    console.log('[记忆服务] 📊 查询未返回数据')
    return { facts: [], preferences: [] }
  }

  const textBuckets = data.text_mem as Array<Record<string, unknown>> | undefined
  const prefBuckets = data.pref_mem as Array<Record<string, unknown>> | undefined

  const facts = extractMemoriesFromBuckets(textBuckets)
  const preferences = extractPreferencesFromBuckets(prefBuckets)

  console.log(`[记忆服务] 📊 查询结果: ${facts.length} 条事实, ${preferences.length} 条偏好`)
  return { facts, preferences }
}
