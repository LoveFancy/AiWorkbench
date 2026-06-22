import { describe, expect, mock, test } from 'bun:test'

mock.module('electron', () => ({
  app: { getPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

mock.module('../../auth', () => ({
  getToken: () => undefined,
}))

mock.module('../../shared/hteip-client', () => ({
  resolveApiBase: () => 'https://example.test',
}))

describe('expert-download-service 取消注册表', () => {
  test('cancelRemoteDownload 对未知 groupId 安全 no-op', async () => {
    const { cancelRemoteDownload } = await import('./expert-download-service.ts')
    expect(() => cancelRemoteDownload('not-exist')).not.toThrow()
  })

  test('cancelRemoteDownload 触发已注册 controller 的 abort', async () => {
    const { cancelRemoteDownload, __registerDownloadForTest } = await import('./expert-download-service.ts')
    const controller = new AbortController()
    __registerDownloadForTest('g1', controller)
    expect(controller.signal.aborted).toBe(false)
    cancelRemoteDownload('g1')
    expect(controller.signal.aborted).toBe(true)
  })
})
