/**
 * 会话标题自动生成
 *
 * 通过 Provider Adapter 调用各渠道的 LLM API 生成简短标题。
 */

import type { AgentGenerateTitleInput } from '@proma/shared'
import { getAdapter, fetchTitle } from '@proma/core'
import { decryptApiKey, listChannels } from '../channel-manager'
import { getEffectiveProxyUrl } from '../proxy-settings-service'
import { getFetchFn } from '../proxy-fetch'
import { getAgentSessionMeta, updateAgentSessionMeta } from '../agent-session-manager'
import { TITLE_PROMPT, MAX_TITLE_LENGTH, DEFAULT_SESSION_TITLE } from './constants'
import type { SessionCallbacks } from '../agent-orchestrator'

/**
 * 生成 Agent 会话标题
 *
 * 使用 Provider 适配器系统，支持所有渠道。任何错误返回 null。
 */
export async function generateTitle(input: AgentGenerateTitleInput): Promise<string | null> {
  const { userMessage, channelId, modelId } = input
  console.log('[Agent 标题生成] 开始生成标题:', { channelId, modelId, userMessage: userMessage.slice(0, 50) })

  try {
    const channels = listChannels()
    const channel = channels.find((c) => c.id === channelId)
    if (!channel) {
      console.warn('[Agent 标题生成] 渠道不存在:', channelId)
      return null
    }

    const apiKey = decryptApiKey(channelId)
    const providerAdapter = getAdapter(channel.provider)
    const request = providerAdapter.buildTitleRequest({
      baseUrl: channel.baseUrl,
      apiKey,
      modelId,
      prompt: TITLE_PROMPT + userMessage,
    })

    const proxyUrl = await getEffectiveProxyUrl()
    const fetchFn = getFetchFn(proxyUrl)
    const title = await fetchTitle(request, providerAdapter, fetchFn)
    if (!title) {
      console.warn('[Agent 标题生成] API 返回空标题')
      return null
    }

    const cleaned = title.trim().replace(/^["'""''「《]+|["'""''」》]+$/g, '').trim()
    const result = cleaned.slice(0, MAX_TITLE_LENGTH) || null

    console.log(`[Agent 标题生成] 生成标题成功: "${result}"`)
    return result
  } catch (error) {
    console.warn('[Agent 标题生成] 生成失败:', error)
    return null
  }
}

/**
 * 流完成后自动生成标题
 *
 * 如果会话标题仍为默认值，自动调用标题生成并通过回调通知。
 */
export async function autoGenerateTitle(
  sessionId: string,
  userMessage: string,
  channelId: string,
  modelId: string,
  callbacks: SessionCallbacks,
): Promise<void> {
  try {
    const meta = getAgentSessionMeta(sessionId)
    if (!meta || meta.title !== DEFAULT_SESSION_TITLE) return

    const title = await generateTitle({ userMessage, channelId, modelId })
    if (!title) return

    updateAgentSessionMeta(sessionId, { title })
    callbacks.onTitleUpdated(title)
    console.log(`[Agent 编排] 自动标题生成完成: "${title}"`)
  } catch (error) {
    console.warn('[Agent 编排] 自动标题生成失败:', error)
  }
}
