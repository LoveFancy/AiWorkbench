import { describe, expect, test } from 'bun:test'
import { testChannelModelWithFetch } from './channel-model-tester.ts'

describe('testChannelModelWithFetch', () => {
  test('华泰 Anthropic 模型测试使用用户 Key 和选择的模型发起 messages 请求', async () => {
    let requestUrl = ''
    let requestInit: RequestInit | undefined
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(url)
      requestInit = init
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: '我是测试模型' }],
      }), { status: 200 })
    }) as typeof fetch

    const result = await testChannelModelWithFetch({
      provider: 'huatai-anthropic',
      baseUrl: 'http://168.63.65.40:8090/llm-service/v1/messages',
      apiKey: 'user-secret-key',
      model: 'local-deepseek-v4-flash',
    }, fetchFn)

    expect(result).toEqual({
      success: true,
      message: '模型响应正常',
      content: '我是测试模型',
    })
    expect(requestUrl).toBe('http://168.63.65.40:8090/llm-service/v1/messages')
    expect(requestInit?.method).toBe('POST')
    expect(requestInit?.headers).toEqual({
      'X-Api-Key': 'user-secret-key',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      messages: [{ role: 'user', content: '你是谁' }],
      stream: false,
      model: 'local-deepseek-v4-flash',
      max_tokens: 2000,
      temperature: 0.8,
    })
  })

  test('模型测试失败时返回接口错误原文', async () => {
    const fetchFn = (async () => new Response(JSON.stringify({
      error: { message: 'model local-deepseek-v4-flash is not authorized' },
    }), { status: 403 })) as unknown as typeof fetch

    const result = await testChannelModelWithFetch({
      provider: 'huatai-anthropic',
      baseUrl: 'http://168.63.65.40:8090/llm-service/v1/messages',
      apiKey: 'user-secret-key',
      model: 'local-deepseek-v4-flash',
    }, fetchFn)

    expect(result.success).toBe(false)
    expect(result.message).toContain('请求失败 (403)')
    expect(result.message).toContain('model local-deepseek-v4-flash is not authorized')
  })

  test('返回 200 但包含 error 字段时展示错误内容', async () => {
    const fetchFn = (async () => new Response(JSON.stringify({
      error: { message: 'API Key 无权访问该模型' },
    }), { status: 200 })) as unknown as typeof fetch

    const result = await testChannelModelWithFetch({
      provider: 'huatai-anthropic',
      baseUrl: 'http://168.63.65.40:8090/llm-service/v1/messages',
      apiKey: 'user-secret-key',
      model: 'local-deepseek-v4-flash',
    }, fetchFn)

    expect(result).toEqual({
      success: false,
      message: 'API Key 无权访问该模型',
    })
  })
})
