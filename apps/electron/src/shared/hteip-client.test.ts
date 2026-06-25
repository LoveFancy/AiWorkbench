import { expect, mock, test } from 'bun:test'

mock.module('../auth', () => ({
  getToken: () => 'test-token',
  getEipGatewayBase: () => 'http://eip.htsc.com.cn/gateway',
}))

const { httpPost, resetApiBaseForTest } = await import('./hteip-client')

test('hteip-client query 始终拼到 URL，POST body 保持独立', async () => {
  resetApiBaseForTest()
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input)
    capturedInit = init
    return new Response(JSON.stringify({ code: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    await httpPost('/paas/app/api/app/listByUserNew', {
      query: { appId: '000368', type: 'log' },
      body: { pageNo: 1 },
    })
  } finally {
    globalThis.fetch = originalFetch
  }

  expect(capturedUrl).toBe('http://eip.htsc.com.cn/paas/app/api/app/listByUserNew?appId=000368&type=log')
  expect(capturedInit?.body).toBe(JSON.stringify({ pageNo: 1 }))
  expect(capturedInit?.headers).toMatchObject({
    Cookie: 'EIPGW-TOKEN=test-token',
  })
})
