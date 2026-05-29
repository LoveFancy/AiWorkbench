import { describe, expect, test } from 'bun:test'

import type { Channel } from '@proma/shared'
import type { SelectedModel } from '@/atoms/chat-atoms'
import { applySavedChannelSnapshot } from './channel-sync'
import { hasUsableChatModel } from './model-selection'

function channel(
  id: string,
  models: Array<{ id: string; enabled: boolean }>,
  apiKeyConfigured: boolean,
): Channel {
  return {
    id,
    name: id,
    provider: 'anthropic',
    baseUrl: 'https://example.com',
    apiKey: 'encrypted',
    apiKeyConfigured,
    models: models.map((model) => ({
      id: model.id,
      name: model.id,
      enabled: model.enabled,
    })),
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('applySavedChannelSnapshot', () => {
  test('渠道保存 API Key 后立即让 Chat 可用，并保留当前选中的模型', () => {
    const currentModel: SelectedModel = {
      channelId: 'deepseek',
      modelId: 'deepseek-v4-flash',
    }

    const result = applySavedChannelSnapshot(
      [channel('deepseek', [{ id: 'deepseek-v4-flash', enabled: true }], false)],
      channel('deepseek', [{ id: 'deepseek-v4-flash', enabled: true }], true),
      currentModel,
    )

    expect(result.channels[0]?.apiKeyConfigured).toBe(true)
    expect(result.selectedModel).toEqual(currentModel)
    expect(hasUsableChatModel(result.channels)).toBe(true)
  })
})
