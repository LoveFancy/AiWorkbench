import { describe, expect, mock, test } from 'bun:test'

mock.module('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
  },
}))

mock.module('../../../auth', () => ({
  getToken: () => undefined,
}))

describe('WorkMate 安装包下载安全校验', () => {
  test('拒绝非本地 HTTP 下载地址', async () => {
    const { validateInstallerDownloadSecurity } = await import('./workmate-downloader.ts')

    expect(() => validateInstallerDownloadSecurity('http://updates.example.com/workmate.dmg', 'a'.repeat(64)))
      .toThrow('生产环境下载安装包必须使用 HTTPS')
  })

  test('拒绝缺少 SHA-256 的安装包下载', async () => {
    const { validateInstallerDownloadSecurity } = await import('./workmate-downloader.ts')

    expect(() => validateInstallerDownloadSecurity('https://updates.example.com/workmate.dmg', undefined))
      .toThrow('安装包缺少 SHA-256 校验值')
  })
})
