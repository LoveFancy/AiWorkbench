import { describe, expect, test } from 'bun:test'

import type { Channel } from '@proma/shared'
import { PROVIDER_DEFAULT_MODELS, PROVIDER_DEFAULT_URLS } from '@proma/shared'
import { ensurePresetChannels } from './channel-presets.ts'

const timestamp = 1710000000000

function existingChannel(overrides: Partial<Channel>): Channel {
  return {
    id: 'existing-channel',
    name: '已有渠道',
    provider: 'custom',
    baseUrl: 'https://example.com',
    apiKey: 'encrypted-user-key',
    models: [],
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

describe('渠道预置配置', () => {
  test('缺少默认渠道时补齐 DeepSeek 和华泰渠道，API Key 保持为空', () => {
    const result = ensurePresetChannels({
      channels: [],
      now: () => timestamp,
      createId: (provider) => `preset-${provider}`,
      encryptApiKey: (key) => `encrypted:${key}`,
    })

    expect(result.changed).toBe(true)
    expect(result.channels.map((channel) => channel.provider)).toEqual([
      'deepseek',
      'huatai-anthropic',
      'huatai-openai',
    ])
    expect(result.channels.map((channel) => channel.apiKey)).toEqual([
      'encrypted:',
      'encrypted:',
      'encrypted:',
    ])
    expect(result.channels[1]).toMatchObject({
      id: 'preset-huatai-anthropic',
      name: '华泰（Anthropic）',
      provider: 'huatai-anthropic',
      baseUrl: PROVIDER_DEFAULT_URLS['huatai-anthropic'],
      models: PROVIDER_DEFAULT_MODELS['huatai-anthropic'],
      enabled: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(result.channels[2]).toMatchObject({
      id: 'preset-huatai-openai',
      name: '华泰（OpenAI）',
      provider: 'huatai-openai',
      baseUrl: PROVIDER_DEFAULT_URLS['huatai-openai'],
      models: PROVIDER_DEFAULT_MODELS['huatai-openai'],
      enabled: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  })

  test('已有同类型或同地址渠道时不会重复创建预置渠道', () => {
    const channels = [
      existingChannel({ id: 'custom-deepseek', provider: 'custom', baseUrl: 'https://api.deepseek.com/anthropic' }),
      existingChannel({ id: 'custom-huatai-anthropic', provider: 'custom', baseUrl: PROVIDER_DEFAULT_URLS['huatai-anthropic'] }),
      existingChannel({ id: 'saved-huatai-openai', provider: 'huatai-openai', baseUrl: 'https://internal.example.com/v1' }),
    ]

    const result = ensurePresetChannels({
      channels,
      now: () => timestamp,
      createId: (provider) => `preset-${provider}`,
      encryptApiKey: (key) => `encrypted:${key}`,
    })

    expect(result.changed).toBe(false)
    expect(result.channels).toEqual(channels)
  })
})
