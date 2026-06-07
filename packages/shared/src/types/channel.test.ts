import { describe, expect, test } from 'bun:test'

import { PROVIDER_DEFAULT_MODELS, PROVIDER_DEFAULT_URLS } from './channel.ts'

describe('渠道默认配置', () => {
  test('华泰 Anthropic 默认使用完整 messages 地址并将预置模型放在可用模型中', () => {
    expect(PROVIDER_DEFAULT_URLS['huatai-anthropic']).toBe('http://168.63.65.40:8090/llm-service/v1/messages')
    expect(PROVIDER_DEFAULT_MODELS['huatai-anthropic']?.map((model) => model.id)).toEqual([
      'saas-doubao-15-pro-32k',
      'saas-deepseek-v32',
      'local-deepseek-v32',
      'local-qwen36-27b',
      'local-qwen3-235b-nothink-moe',
      'saas-doubao-seed-20-pro',
      'saas-kimi-k25',
      'saas-kimi-k26',
      'saas-qwen35-397b',
      'local-qwen3-vl-30b',
      'saas-glm-51',
      'saas-qwen36-plus',
      'saas-deepseek-v4-flash',
      'saas-deepseek-v4-pro',
    ])
    expect(
      PROVIDER_DEFAULT_MODELS['huatai-anthropic']
        ?.filter((model) => model.supportsMultimodal)
        .map((model) => model.id)
    ).toEqual([
      'local-qwen36-27b',
      'saas-doubao-seed-20-pro',
      'saas-kimi-k25',
      'saas-kimi-k26',
      'saas-qwen35-397b',
      'local-qwen3-vl-30b',
      'saas-glm-51',
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
