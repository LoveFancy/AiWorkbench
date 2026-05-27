import { describe, expect, test } from 'bun:test'

import { streamSSE } from './sse-reader.ts'
import type { ProviderAdapter, StreamEvent } from './types.ts'

const adapter: ProviderAdapter = {
  providerType: 'huatai-anthropic',
  buildStreamRequest: () => ({
    url: 'https://example.com/messages',
    headers: {},
    body: '{}',
  }),
  parseSSELine: (): StreamEvent[] => [],
  buildTitleRequest: () => ({
    url: 'https://example.com/messages',
    headers: {},
    body: '{}',
  }),
  parseTitleResponse: () => null,
}

describe('streamSSE', () => {
  test('HTTP 200 但返回业务错误 JSON 时抛出可读错误', async () => {
    const fetchFn = async (): Promise<Response> => new Response(
      JSON.stringify({
        code: 809,
        msg: '当前apiKey没有资源',
        data: null,
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      },
    )

    await expect(streamSSE({
      request: {
        url: 'https://example.com/messages',
        headers: {},
        body: '{}',
      },
      adapter,
      fetchFn,
      onEvent: () => {},
    })).rejects.toThrow('huatai-anthropic API 业务错误 (809): 当前apiKey没有资源')
  })
})
