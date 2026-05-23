import { describe, expect, test } from 'bun:test'

import type { Channel } from '@proma/shared'
import type { SelectedModel } from '@/atoms/chat-atoms'
import { hasUsableChatModel, resolveAgentSelectedModel, resolveSelectedModel } from './model-selection'

function channel(
  id: string,
  models: Array<{ id: string; enabled: boolean }>,
  enabled = true,
): Channel {
  return {
    id,
    name: id,
    provider: 'openai',
    baseUrl: 'https://example.com',
    apiKey: 'encrypted',
    models: models.map((model) => ({
      id: model.id,
      name: model.id,
      enabled: model.enabled,
    })),
    enabled,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('resolveSelectedModel', () => {
  test('当前未选择模型时，使用第一个启用渠道的第一个启用模型', () => {
    const resolved = resolveSelectedModel([
      channel('disabled-channel', [{ id: 'ignored', enabled: true }], false),
      channel('empty-channel', [{ id: 'disabled-model', enabled: false }]),
      channel('usable-channel', [
        { id: 'first-disabled', enabled: false },
        { id: 'first-usable', enabled: true },
      ]),
    ], null)

    expect(resolved).toEqual({
      channelId: 'usable-channel',
      modelId: 'first-usable',
    })
  })

  test('当前选择仍可用时，保留用户选择', () => {
    const current: SelectedModel = {
      channelId: 'second-channel',
      modelId: 'chosen-model',
    }

    expect(resolveSelectedModel([
      channel('first-channel', [{ id: 'first-model', enabled: true }]),
      channel('second-channel', [{ id: 'chosen-model', enabled: true }]),
    ], current)).toBe(current)
  })

  test('当前选择失效时，回退到第一个可用模型', () => {
    const resolved = resolveSelectedModel([
      channel('first-channel', [{ id: 'fallback-model', enabled: true }]),
      channel('old-channel', [{ id: 'old-model', enabled: false }]),
    ], {
      channelId: 'old-channel',
      modelId: 'old-model',
    })

    expect(resolved).toEqual({
      channelId: 'first-channel',
      modelId: 'fallback-model',
    })
  })
})

describe('hasUsableChatModel', () => {
  test('存在启用渠道和启用模型时返回 true', () => {
    expect(hasUsableChatModel([
      channel('disabled-channel', [{ id: 'ignored', enabled: true }], false),
      channel('usable-channel', [{ id: 'usable-model', enabled: true }]),
    ])).toBe(true)
  })

  test('没有启用模型时返回 false', () => {
    expect(hasUsableChatModel([
      channel('disabled-channel', [{ id: 'ignored', enabled: true }], false),
      channel('empty-channel', [{ id: 'disabled-model', enabled: false }]),
    ])).toBe(false)
  })
})

describe('resolveAgentSelectedModel', () => {
  test('没有 Agent 可用渠道时返回 null，保留配置提示', () => {
    const resolved = resolveAgentSelectedModel([
      channel('chat-only', [{ id: 'chat-model', enabled: true }]),
    ], [], null)

    expect(resolved).toBeNull()
  })

  test('从没有 Agent 供应商变为有时，选择白名单渠道的第一个启用模型', () => {
    const resolved = resolveAgentSelectedModel([
      channel('chat-only', [{ id: 'chat-model', enabled: true }]),
      channel('agent-channel', [
        { id: 'disabled-agent-model', enabled: false },
        { id: 'agent-model', enabled: true },
      ]),
    ], ['agent-channel'], null)

    expect(resolved).toEqual({
      channelId: 'agent-channel',
      modelId: 'agent-model',
    })
  })

  test('当前 Agent 选择仍可用时，保留用户选择', () => {
    const current = {
      channelId: 'agent-channel',
      modelId: 'chosen-agent-model',
    }

    expect(resolveAgentSelectedModel([
      channel('agent-channel', [{ id: 'chosen-agent-model', enabled: true }]),
    ], ['agent-channel'], current)).toBe(current)
  })

  test('当前 Agent 选择失效时，回退到白名单中的第一个可用模型', () => {
    const resolved = resolveAgentSelectedModel([
      channel('fallback-channel', [{ id: 'fallback-model', enabled: true }]),
      channel('old-channel', [{ id: 'old-model', enabled: false }]),
    ], ['fallback-channel', 'old-channel'], {
      channelId: 'old-channel',
      modelId: 'old-model',
    })

    expect(resolved).toEqual({
      channelId: 'fallback-channel',
      modelId: 'fallback-model',
    })
  })
})
