import { describe, expect, test } from 'bun:test'

import {
  buildCompassSearchRequest,
  executeWebSearchTool,
  formatCompassSearchResults,
  getBuiltinWebSearchApiKey,
  parseCompassSearchResponse,
  testWebSearchConnection,
  WEB_SEARCH_TOOL_DEFINITIONS,
  WEB_SEARCH_TOOL_META,
} from './web-search-tool.ts'

describe('数智中台联网搜索工具', () => {
  test('使用内置裸 API Key，无需用户填写', () => {
    expect(getBuiltinWebSearchApiKey()).toBe('ngaflkmmttnaab2jzkaa')
  })

  test('构造数智中台搜索请求时分别使用 appId、apiKey header 和默认一个月搜索参数', () => {
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
      TimeRange: 'OneMonth',
    })
  })

  test('构造数智中台搜索请求时可覆盖搜索有效期', () => {
    const request = buildCompassSearchRequest('黄金怎么样', 'secret', { timeRange: 'OneWeek' })

    expect(JSON.parse(String(request.init.body)).TimeRange).toBe('OneWeek')
  })

  test('工具提示要求根据检索内容判断不同的时效范围', () => {
    const instructions = WEB_SEARCH_TOOL_META.systemPromptAppend ?? ''
    const toolDefinition = WEB_SEARCH_TOOL_DEFINITIONS[0]
    const timeRangeProperty = toolDefinition?.parameters.properties.timeRange
    if (!timeRangeProperty) throw new Error('web_search 缺少 timeRange 参数定义')
    const timeRangeDescription = timeRangeProperty.description ?? ''

    expect(instructions).toContain('根据问题的时效性选择 timeRange')
    expect(instructions).toContain('OneDay')
    expect(instructions).toContain('OneWeek')
    expect(instructions).toContain('OneMonth')
    expect(instructions).toContain('OneYear')
    expect(instructions).toContain('结果不足时可以扩大时间范围')
    expect(timeRangeDescription).toContain('Choose by content freshness')
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

  test('解析数智中台 result.webResults 响应结构', () => {
    const parsed = parseCompassSearchResponse({
      responseMetadata: {
        requestId: '2026052510342487969A6DB44B2616AE2B',
        error: null,
      },
      result: {
        resultCount: 2,
        webResults: [
          {
            title: '金价大跌15年之最！一周狂跌近10%',
            siteName: '今日头条',
            url: 'http://m.toutiao.com/group/7643440198033900095/',
            snippet: '金价大跌15年之最，一周狂跌近10%。',
          },
          {
            title: '黄金市场最新行情',
            url: 'https://example.com/gold-market',
            snippet: '黄金市场出现明显波动。',
          },
        ],
      },
    })

    expect(parsed).toEqual([
      {
        title: '金价大跌15年之最！一周狂跌近10%',
        url: 'http://m.toutiao.com/group/7643440198033900095/',
        content: '金价大跌15年之最，一周狂跌近10%。',
      },
      {
        title: '黄金市场最新行情',
        url: 'https://example.com/gold-market',
        content: '黄金市场出现明显波动。',
      },
    ])
  })

  test('result.webResults 同时包含 snippet 和 content 时优先使用完整 content', () => {
    const parsed = parseCompassSearchResponse({
      result: {
        webResults: [
          {
            title: '环境质量_中华人民共和国生态环境部',
            url: 'https://www.mee.gov.cn/hjzl/',
            snippet: '环境质量\n生态环境状况公报',
            content: '环境质量\n生态环境状况公报\n中国生态环境状况公报\n2024年，全国生态环境质量持续改善。',
          },
        ],
      },
    })

    expect(parsed[0]?.content).toContain('中国生态环境状况公报')
    expect(parsed[0]?.content).toContain('2024年，全国生态环境质量持续改善')
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
        arguments: { query: '黄金怎么样', timeRange: 'OneYear' },
      }, directFetch)

      expect(globalFetchCalled).toBe(false)
      expect(capturedUrl).toBe('http://168.63.65.40:8090/ai-service/v1/api/web/search')
      expect(result.toolCallId).toBe('tool-1')
      expect(result.content).toBe('未找到相关结果。')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('执行联网搜索时记录查询参数和返回摘要，便于排查 Agent 搜索无内容问题', async () => {
    const originalInfo = console.info
    const logs: string[] = []
    console.info = (...args: unknown[]) => {
      logs.push(args.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' '))
    }

    try {
      const directFetch = async () => {
        return new Response(JSON.stringify({
          result: {
            resultCount: 1,
            webResults: [
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

      await executeWebSearchTool({
        id: 'tool-1',
        name: 'web_search',
        arguments: { query: '黄金怎么样', timeRange: 'OneWeek' },
      }, directFetch)

      const joinedLogs = logs.join('\n')
      expect(joinedLogs).toContain('[联网搜索] 请求')
      expect(joinedLogs).toContain('[联网搜索] 返回')
      expect(joinedLogs).toContain('黄金怎么样')
      expect(joinedLogs).toContain('OneWeek')
      expect(joinedLogs).toContain('resultCount')
      expect(joinedLogs).toContain('黄金受避险需求影响上涨')
      expect(joinedLogs).not.toContain(getBuiltinWebSearchApiKey())
    } finally {
      console.info = originalInfo
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
    let capturedTimeRange = ''
    const directFetch = async (_input: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      capturedQuery = body.query
      capturedTimeRange = body.TimeRange
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

    const result = await testWebSearchConnection('黄金', { timeRange: 'OneWeek' }, directFetch)

    expect(capturedQuery).toBe('黄金')
    expect(capturedTimeRange).toBe('OneWeek')
    expect(result.success).toBe(true)
    expect(result.message).toBe('搜索成功，返回 1 条结果')
    expect(result.details).toContain('- [黄金价格上涨](https://example.com/gold)')
  })

  test('测试搜索关键字无结果时返回非成功状态，避免误判为搜索成功', async () => {
    const result = await testWebSearchConnection('zz33', async () => {
      return new Response(JSON.stringify({
        result: {
          resultCount: 0,
          webResults: [],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    expect(result.success).toBe(false)
    expect(result.message).toBe('连接成功，但关键词「zz33」未找到相关结果')
    expect(result.details).toBe('接口已正常返回，请换一个更具体或更常见的关键词重试。')
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
