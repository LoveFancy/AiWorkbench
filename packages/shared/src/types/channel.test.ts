import { describe, expect, test } from 'bun:test'

import { PROVIDER_DEFAULT_MODELS, PROVIDER_DEFAULT_URLS } from './channel.ts'

describe('渠道默认配置', () => {
  test('华泰 Anthropic 默认使用完整 messages 地址并将预置模型放在可用模型中', () => {
    expect(PROVIDER_DEFAULT_URLS['huatai-anthropic']).toBe('http://168.63.65.40:8090/llm-service/v1/messages')
    expect(PROVIDER_DEFAULT_MODELS['huatai-anthropic']).toEqual([
      { id: 'local-glm-47-flash', name: 'local-glm-47-flash', enabled: false },
      { id: 'saas-kimi-k25', name: 'saas-kimi-k25', enabled: false },
      { id: 'local-deepseek-v4-pro', name: 'local-deepseek-v4-pro', enabled: false },
      { id: 'saas-deepseek-v4-flash', name: 'saas-deepseek-v4-flash', enabled: false },
      { id: 'saas-deepseek-v4-pro', name: 'saas-deepseek-v4-pro', enabled: false },
    ])
  })

  test('华泰 OpenAI 默认使用完整 chat completions 地址和指定模型', () => {
    expect(PROVIDER_DEFAULT_URLS['huatai-openai']).toBe('http://168.63.65.40:8090/llm-service/v1/chat/completions')
    expect(PROVIDER_DEFAULT_MODELS['huatai-openai']).toEqual([
      { id: 'local-deepseek-v4-pro', name: 'local-deepseek-v4-pro', enabled: true },
      { id: 'local-deepseek-v32', name: 'local-deepseek-v32', enabled: true },
    ])
  })

  test('华泰默认渠道不包含 local-deepseek-v4-flash', () => {
    const huataiModels = [
      ...(PROVIDER_DEFAULT_MODELS['huatai-anthropic'] ?? []),
      ...(PROVIDER_DEFAULT_MODELS['huatai-openai'] ?? []),
    ]

    expect(huataiModels.map((model) => model.id)).not.toContain('local-deepseek-v4-flash')
  })
})
