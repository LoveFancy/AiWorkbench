import { describe, expect, test } from 'bun:test'

import { PROVIDER_DEFAULT_MODELS, PROVIDER_DEFAULT_URLS } from './channel.ts'

describe('渠道默认配置', () => {
  test('华泰 Anthropic 默认使用完整 messages 地址和 local GLM 模型', () => {
    expect(PROVIDER_DEFAULT_URLS['huatai-anthropic']).toBe('http://168.63.65.40:8090/llm-service/v1/messages')
    expect(PROVIDER_DEFAULT_MODELS['huatai-anthropic']).toEqual([
      { id: 'local-glm-47-flash', name: 'local-glm-47-flash', enabled: true },
    ])
  })

  test('华泰 OpenAI 默认使用完整 chat completions 地址', () => {
    expect(PROVIDER_DEFAULT_URLS['huatai-openai']).toBe('http://168.63.65.40:8090/llm-service/v1/chat/completions')
  })
})
