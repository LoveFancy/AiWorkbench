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
  test('缺少默认渠道时只补齐华泰 Anthropic 渠道，API Key 保持为空', () => {
    const result = ensurePresetChannels({
      channels: [],
      now: () => timestamp,
      createId: (provider) => `preset-${provider}`,
      encryptApiKey: (key) => `encrypted:${key}`,
    })

    expect(result.changed).toBe(true)
    expect(result.channels.map((channel) => channel.provider)).toEqual([
      'huatai-anthropic',
    ])
    expect(result.channels.map((channel) => channel.apiKey)).toEqual([
      'encrypted:',
    ])
    expect(result.channels[0]).toMatchObject({
      id: 'preset-huatai-anthropic',
      name: '华泰（Anthropic）',
      provider: 'huatai-anthropic',
      baseUrl: PROVIDER_DEFAULT_URLS['huatai-anthropic'],
      models: PROVIDER_DEFAULT_MODELS['huatai-anthropic'],
      enabled: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  })

  test('已有同类型或同地址的华泰 Anthropic 渠道时不会重复创建预置渠道', () => {
    const channels = [
      existingChannel({ id: 'custom-huatai-anthropic', provider: 'custom', baseUrl: PROVIDER_DEFAULT_URLS['huatai-anthropic'] }),
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

  test('用户已配置过的 DeepSeek 渠道不会被移除', () => {
    const userDeepSeek = existingChannel({
      id: 'user-deepseek',
      name: '我的 DeepSeek',
      provider: 'deepseek',
      baseUrl: PROVIDER_DEFAULT_URLS.deepseek,
      apiKey: 'encrypted:user-key',
      models: PROVIDER_DEFAULT_MODELS.deepseek ?? [],
      enabled: true,
    })

    const result = ensurePresetChannels({
      channels: [userDeepSeek],
      now: () => timestamp,
      createId: (provider) => `preset-${provider}`,
      encryptApiKey: (key) => `encrypted:${key}`,
    })

    expect(result.channels[0]).toEqual(userDeepSeek)
    expect(result.channels.map((channel) => channel.provider)).toEqual(['deepseek', 'huatai-anthropic'])
  })
})
