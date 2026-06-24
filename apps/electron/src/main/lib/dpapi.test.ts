import { describe, expect, mock, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

mock.module('electron', () => ({
  app: {
    isPackaged: false,
  },
}))

describe('Windows DPAPI prebuild 加载路径', () => {
  test('打包环境优先从 resourcesPath/dpapi-prebuilds 定位 native 模块', async () => {
    const { resolveDpapiPrebuildPath } = await import('./dpapi.ts')
    const root = mkdtempSync(join(tmpdir(), 'workmate-dpapi-'))
    try {
      const nativePath = join(root, 'dpapi-prebuilds', 'win32-x64', '@primno+dpapi.node')
      mkdirSync(join(root, 'dpapi-prebuilds', 'win32-x64'), { recursive: true })
      writeFileSync(nativePath, '')

      const resolved = resolveDpapiPrebuildPath({
        isPackaged: true,
        resourcesPath: root,
        dirname: join(root, 'app.asar', 'dist'),
        platform: 'win32',
        arch: 'x64',
      })

      expect(resolved).toBe(nativePath)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('缺少 native 模块时错误信息包含所有检查路径', async () => {
    const { buildDpapiPrebuildCandidates, resolveDpapiPrebuildPath } = await import('./dpapi.ts')
    const candidates = buildDpapiPrebuildCandidates({
      isPackaged: true,
      resourcesPath: 'C:\\Program Files\\WorkMate\\resources',
      dirname: 'C:\\Program Files\\WorkMate\\resources\\app.asar\\dist',
      platform: 'win32',
      arch: 'x64',
    })

    expect(() => resolveDpapiPrebuildPath({
      isPackaged: true,
      resourcesPath: 'C:\\Program Files\\WorkMate\\resources',
      dirname: 'C:\\Program Files\\WorkMate\\resources\\app.asar\\dist',
      platform: 'win32',
      arch: 'x64',
    })).toThrow(candidates[0])
  })
})
