import { describe, expect, test } from 'bun:test'

import {
  buildCompassSearchRequest,
  executeWebSearchTool,
  formatCompassSearchResults,
  getBuiltinWebSearchApiKey,
  parseCompassSearchResponse,
  testWebSearchConnection,
} from './web-search-tool.ts'

describe('数智中台联网搜索工具', () => {
  test('使用内置裸 API Key，无需用户填写', () => {
    expect(getBuiltinWebSearchApiKey()).toBe('ngaflkmmttnaab2jzkaa')
  })

  test('构造数智中台搜索请求时分别使用 appId、apiKey header 和 OneDay 搜索参数', () => {
    const request = buildCompassSearchRequest('黄金怎么样', 'secret')

    expect(request.url).toBe('http://168.63.65.40:8090/ai-service/v1/api/web/search')
    expect(request.init.method).toBe('POST')
    expect(request.init.headers).toEqual({
      apiKey: 'secret',
      appId: '001421',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(request.init.body))).toEqual({
      query: '黄金怎么样',
      SearchType: 'web',
      count: 10,
      Filter: {
        NeedContent: false,
        NeedUrl: true,
        Sites: null,
        AuthInfoLevel: '0',
      },
      NeedSummary: false,
      TimeRange: 'OneDay',
    })
  })

  test('解析常见搜索响应字段并格式化为带链接的结果列表', () => {
    const parsed = parseCompassSearchResponse({
      data: {
        results: [
          {
            title: '黄金价格上涨',
            url: 'https://example.com/gold',
            snippet: '黄金受避险需求影响上涨。',
          },
        ],
      },
    })

    expect(parsed).toEqual([
      {
        title: '黄金价格上涨',
        url: 'https://example.com/gold',
        content: '黄金受避险需求影响上涨。',
      },
    ])
    expect(formatCompassSearchResults(parsed)).toContain('- [黄金价格上涨](https://example.com/gold)')
  })

  test('搜索响应没有结果时返回空列表提示', () => {
    const parsed = parseCompassSearchResponse({ data: { results: [] } })

    expect(formatCompassSearchResults(parsed)).toBe('未找到相关结果。')
  })

  test('执行联网搜索时不使用全局 fetch 代理路径', async () => {
    const originalFetch = globalThis.fetch
    let globalFetchCalled = false

    globalThis.fetch = (async () => {
      globalFetchCalled = true
      throw new Error('不应调用全局 fetch')
    }) as unknown as typeof globalThis.fetch

    try {
      let capturedUrl = ''
      const directFetch = async (input: string, init: RequestInit) => {
        capturedUrl = String(input)
        expect(init?.method).toBe('POST')
        return new Response(JSON.stringify({ data: { results: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const result = await executeWebSearchTool({
        id: 'tool-1',
        name: 'web_search',
        arguments: { query: '黄金怎么样' },
      }, directFetch)

      expect(globalFetchCalled).toBe(false)
      expect(capturedUrl).toBe('http://168.63.65.40:8090/ai-service/v1/api/web/search')
      expect(result.toolCallId).toBe('tool-1')
      expect(result.content).toBe('未找到相关结果。')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('测试连接时也不使用全局 fetch 代理路径', async () => {
    const originalFetch = globalThis.fetch
    let globalFetchCalled = false

    globalThis.fetch = (async () => {
      globalFetchCalled = true
      throw new Error('不应调用全局 fetch')
    }) as unknown as typeof globalThis.fetch

    try {
      let capturedUrl = ''
      const directFetch = async (input: string, init: RequestInit) => {
        capturedUrl = String(input)
        expect(init?.method).toBe('POST')
        return new Response(JSON.stringify({ data: { results: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const result = await testWebSearchConnection(directFetch)

      expect(globalFetchCalled).toBe(false)
      expect(capturedUrl).toBe('http://168.63.65.40:8090/ai-service/v1/api/web/search')
      expect(result).toEqual({ success: true, message: '连接成功，数智中台搜索 API 可用' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('测试搜索关键字时返回格式化结果内容', async () => {
    let capturedQuery = ''
    const directFetch = async (_input: string, init: RequestInit) => {
      capturedQuery = JSON.parse(String(init.body)).query
      return new Response(JSON.stringify({
        data: {
          results: [
            {
              title: '黄金价格上涨',
              url: 'https://example.com/gold',
              snippet: '黄金受避险需求影响上涨。',
            },
          ],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await testWebSearchConnection('黄金', directFetch)

    expect(capturedQuery).toBe('黄金')
    expect(result.success).toBe(true)
    expect(result.message).toBe('搜索成功，返回 1 条结果')
    expect(result.details).toContain('- [黄金价格上涨](https://example.com/gold)')
  })

  test('测试连接失败时展示底层网络错误原因', async () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED 168.63.65.40:8090'), {
      code: 'ECONNREFUSED',
      errno: -61,
      syscall: 'connect',
      address: '168.63.65.40',
      port: 8090,
    })
    const error = new Error('fetch failed', { cause })

    const result = await testWebSearchConnection(async () => {
      throw error
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('fetch failed')
    expect(result.message).toContain('ECONNREFUSED')
    expect(result.message).toContain('168.63.65.40')
    expect(result.message).toContain('8090')
  })
})
