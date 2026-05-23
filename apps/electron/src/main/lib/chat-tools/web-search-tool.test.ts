import { describe, expect, test } from 'bun:test'

import {
  buildCompassSearchRequest,
  formatCompassSearchResults,
  getBuiltinWebSearchApiKey,
  parseCompassSearchResponse,
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
})
