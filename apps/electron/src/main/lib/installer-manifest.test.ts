import { afterEach, expect, test } from 'bun:test'
import { fetchInstallerManifest, findInstallerSource } from './installer-manifest'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('Windows x64 安装包清单使用内网 Git 和 Node.js 下载源', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    installers: [
      {
        id: 'git-for-windows',
        platform: 'win32',
        arch: 'x64',
        version: '2.47.1',
        downloadUrl: 'https://example.com/old-git.exe',
        fallbackUrl: 'https://example.com/old-git-fallback.exe',
        sha256: '',
        sizeBytes: 66000000,
        filename: 'Git-2.47.1-64-bit.exe',
      },
      {
        id: 'nodejs',
        platform: 'win32',
        arch: 'x64',
        version: '22.13.1',
        downloadUrl: 'https://example.com/old-node.msi',
        fallbackUrl: 'https://example.com/old-node-fallback.msi',
        sha256: '',
        sizeBytes: 28000000,
        filename: 'node-v22.13.1-x64.msi',
      },
    ],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as unknown as typeof fetch

  const manifest = await fetchInstallerManifest(true)
  const git = findInstallerSource(manifest, 'git-for-windows', 'x64')
  const nodejs = findInstallerSource(manifest, 'nodejs', 'x64')

  expect(git).toMatchObject({
    version: '2.54.0',
    downloadUrl: 'https://htpan.htsc.com.cn/l/iFghB9',
    fallbackUrl: '',
    filename: 'Git-2.54.0-64-bit.exe',
  })
  expect(nodejs).toMatchObject({
    version: '24.15.0',
    downloadUrl: 'https://htpan.htsc.com.cn/l/vF2xEX',
    fallbackUrl: '',
    filename: 'node-v24.15.0-x64.msi',
  })
})
