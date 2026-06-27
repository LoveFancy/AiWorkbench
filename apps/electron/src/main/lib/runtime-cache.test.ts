import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuntimeStatus } from '@proma/shared'

let root = ''
let readRuntimeCache: typeof import('./runtime-cache.ts').readRuntimeCache
let writeRuntimeCache: typeof import('./runtime-cache.ts').writeRuntimeCache

mock.module('electron', () => ({
  app: {
    getPath: () => root,
  },
}))

function cacheFilePath(): string {
  return join(root, 'runtime-cache.json')
}

function makeStatus(): RuntimeStatus {
  return {
    node: { available: true, version: '22.0.0', path: 'C:/node.exe', error: null },
    bun: { available: false, version: null, path: null, source: null, error: null },
    git: { available: true, version: '2.50.0', path: 'C:/git.exe', error: null },
    shell: {
      gitBash: { available: true, version: '5.2', path: 'C:/bash.exe', error: null },
      wsl: { available: false, version: null, defaultDistro: null, distros: [], error: '已屏蔽' },
      recommended: 'git-bash',
    },
    envLoaded: true,
    initializedAt: 1700000000000,
  }
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'proma-runtime-cache-'))
  const mod = await import('./runtime-cache.ts')
  readRuntimeCache = mod.readRuntimeCache
  writeRuntimeCache = mod.writeRuntimeCache
})

afterEach(() => {
  rmSync(cacheFilePath(), { force: true })
})

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

describe('运行时检测磁盘缓存', () => {
  test('文件不存在时返回 null', () => {
    expect(readRuntimeCache()).toBeNull()
  })

  test('写入后可原样读回（往返一致）', () => {
    const status = makeStatus()
    writeRuntimeCache(status)
    const loaded = readRuntimeCache()
    expect(loaded).toEqual(status)
  })

  test('schema 版本不匹配时返回 null', () => {
    writeFileSync(
      cacheFilePath(),
      JSON.stringify({ schemaVersion: 999, platform: process.platform, status: makeStatus() }),
      'utf-8',
    )
    expect(readRuntimeCache()).toBeNull()
  })

  test('平台不匹配时返回 null', () => {
    const otherPlatform = process.platform === 'win32' ? 'darwin' : 'win32'
    writeFileSync(
      cacheFilePath(),
      JSON.stringify({ schemaVersion: 1, platform: otherPlatform, status: makeStatus() }),
      'utf-8',
    )
    expect(readRuntimeCache()).toBeNull()
  })

  test('JSON 损坏时返回 null（不抛出）', () => {
    writeFileSync(cacheFilePath(), '{ this is not valid json', 'utf-8')
    expect(readRuntimeCache()).toBeNull()
  })

  test('核心字段缺失时返回 null', () => {
    const incomplete = makeStatus() as Partial<RuntimeStatus>
    delete incomplete.git
    writeFileSync(
      cacheFilePath(),
      JSON.stringify({ schemaVersion: 1, platform: process.platform, status: incomplete }),
      'utf-8',
    )
    expect(readRuntimeCache()).toBeNull()
  })
})
