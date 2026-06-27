import { expect, mock, test } from 'bun:test'

let capturedPath = ''
let capturedOpts: Record<string, unknown> | null = null
const requestTimes: number[] = []

mock.module('../../shared/hteip-client', () => ({
  httpRequest: async (path: string, opts: Record<string, unknown>) => {
    requestTimes.push(Date.now())
    capturedPath = path
    capturedOpts = opts
    return {
      status: 200,
      ok: true,
      data: {
        code: 0,
        data: {
          items: [{ id: 'app-1', name: '应用一' }],
        },
      },
    }
  },
}))

const { executeEipRequest, __eipRequestServiceTest } = await import('./eip-request-service')

test('eip_request 连续真实请求之间至少间隔 1 秒', async () => {
  const originalCapturedPath = capturedPath
  const originalCapturedOpts = capturedOpts

  capturedPath = ''
  capturedOpts = null
  requestTimes.length = 0
  __eipRequestServiceTest.resetRateLimitForTest()

  await Promise.all([
    executeEipRequest({
      method: 'GET',
      path: '/paas/app/api/app/listByUserNew',
    }),
    executeEipRequest({
      method: 'GET',
      path: '/paas/app/api/app/listByUserNew',
    }),
  ])

  expect(requestTimes.length).toBeGreaterThanOrEqual(2)
  const firstRequestTime = requestTimes[0]
  const secondRequestTime = requestTimes[1]
  expect(firstRequestTime).toBeDefined()
  expect(secondRequestTime).toBeDefined()
  expect((secondRequestTime ?? 0) - (firstRequestTime ?? 0)).toBeGreaterThanOrEqual(1000)

  capturedPath = originalCapturedPath
  capturedOpts = originalCapturedOpts
  __eipRequestServiceTest.resetRateLimitForTest()
})

test('eip_request 保留 POST + query 语义并支持 resultPath 提取', async () => {
  __eipRequestServiceTest.resetRateLimitForTest()

  const result = await executeEipRequest({
    method: 'POST',
    path: '/paas/app/api/app/listByUserNew',
    query: { appId: '000368', type: 'log' },
    headers: { Accept: '*/*' },
    resultPath: 'data.items',
  })

  expect(capturedPath).toBe('/paas/app/api/app/listByUserNew')
  expect(capturedOpts).toMatchObject({
    method: 'POST',
    query: { appId: '000368', type: 'log' },
    headers: { Accept: '*/*' },
  })
  expect(result.data).toEqual([{ id: 'app-1', name: '应用一' }])
})

test('eip_request 拒绝敏感请求头', () => {
  expect(() => __eipRequestServiceTest.assertSafeHeaders({
    Cookie: 'EIPGW-TOKEN=secret',
  })).toThrow('敏感请求头')

  expect(() => __eipRequestServiceTest.assertSafeHeaders({
    Authorization: 'Bearer secret',
  })).toThrow('敏感请求头')
})

test('eip_request 限制请求目标为 EIP 相对路径或允许域名', () => {
  expect(() => __eipRequestServiceTest.assertSafePath('/paas/app/api')).not.toThrow()
  expect(() => __eipRequestServiceTest.assertSafePath('http://eip.htsc.com.cn/paas/app/api')).not.toThrow()
  expect(() => __eipRequestServiceTest.assertSafePath('//evil.example/api')).toThrow()
  expect(() => __eipRequestServiceTest.assertSafePath('https://evil.example/api')).toThrow('非 EIP 域名')
})
