import { describe, expect, test } from 'bun:test'

import { PROVIDER_DEFAULT_MODELS, PROVIDER_DEFAULT_URLS, PROVIDER_LABELS } from './channel.ts'

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
    ])
    const glm51 = PROVIDER_DEFAULT_MODELS['huatai-anthropic']?.find((model) => model.id === 'saas-glm-51')
    expect(glm51?.supportsMultimodal).toBe(false)
  })

  test('默认渠道不再包含华泰 OpenAI 格式', () => {
    expect(Object.keys(PROVIDER_DEFAULT_URLS)).not.toContain('huatai-openai')
    expect(Object.keys(PROVIDER_DEFAULT_MODELS)).not.toContain('huatai-openai')
    expect(Object.keys(PROVIDER_LABELS)).not.toContain('huatai-openai')
  })

  test('华泰默认渠道不包含 local-deepseek-v4-flash', () => {
    const huataiModels = [
      ...(PROVIDER_DEFAULT_MODELS['huatai-anthropic'] ?? []),
    ]

    expect(huataiModels.map((model) => model.id)).not.toContain('local-deepseek-v4-flash')
  })
})
