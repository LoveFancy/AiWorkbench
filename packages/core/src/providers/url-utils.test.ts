import { describe, expect, test } from 'bun:test'

import { normalizeBaseUrl, resolveOpenAIChatCompletionsUrl, resolveOpenAIModelsUrl } from './url-utils.ts'

describe('URL 规范化工具', () => {
  test('OpenAI 兼容渠道支持完整 chat completions 调用地址', () => {
    const endpoint = 'http://168.63.65.40:8090/llm-service/v1/chat/completions'

    expect(resolveOpenAIChatCompletionsUrl(endpoint)).toBe(endpoint)
    expect(resolveOpenAIModelsUrl(endpoint)).toBe('http://168.63.65.40:8090/llm-service/v1/models')
  })

  test('OpenAI 兼容渠道继续支持普通 base URL', () => {
    const baseUrl = 'http://168.63.65.40:8090/llm-service/v1'

    expect(normalizeBaseUrl(baseUrl)).toBe(baseUrl)
    expect(resolveOpenAIChatCompletionsUrl(baseUrl)).toBe(`${baseUrl}/chat/completions`)
    expect(resolveOpenAIModelsUrl(baseUrl)).toBe(`${baseUrl}/models`)
  })
})
