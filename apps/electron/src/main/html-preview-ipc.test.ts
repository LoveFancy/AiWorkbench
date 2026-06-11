import { describe, expect, test } from 'bun:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { isValidHtmlFile, buildHtmlPreviewUrl } from './lib/html-preview-service'

function makeTempDir(): string {
  const dir = join(tmpdir(), `proma-test-html-preview-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeEmptyFile(dir: string, name: string): string {
  const p = join(dir, name)
  writeFileSync(p, '<html></html>', 'utf-8')
  return p
}

describe('isValidHtmlFile', () => {
  test('接受 .html 普通文件', () => {
    const dir = makeTempDir()
    try {
      const path = makeEmptyFile(dir, 'page.html')
      expect(isValidHtmlFile(path)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('接受 .htm 普通文件', () => {
    const dir = makeTempDir()
    try {
      const path = makeEmptyFile(dir, 'page.htm')
      expect(isValidHtmlFile(path)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('拒绝 .css 文件', () => {
    const dir = makeTempDir()
    try {
      const path = makeEmptyFile(dir, 'style.css')
      expect(isValidHtmlFile(path)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('拒绝不存在的文件', () => {
    const dir = makeTempDir()
    try {
      expect(isValidHtmlFile(join(dir, 'missing.html'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('拒绝目录', () => {
    const dir = makeTempDir()
    try {
      const subDir = join(dir, 'subdir.html')
      mkdirSync(subDir)
      expect(isValidHtmlFile(subDir)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('大小写不敏感', () => {
    const dir = makeTempDir()
    try {
      expect(isValidHtmlFile(makeEmptyFile(dir, 'PAGE.HTML'))).toBe(true)
      expect(isValidHtmlFile(makeEmptyFile(dir, 'Index.Htm'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('buildHtmlPreviewUrl', () => {
  test('构建包含 token 和相对路径的 URL', () => {
    const dir = makeTempDir()
    try {
      const htmlPath = makeEmptyFile(dir, 'index.html')
      const result = buildHtmlPreviewUrl(htmlPath, () => 'proma-file://test-token')
      expect(result.url).toBe('proma-file://test-token/index.html')
      expect(result.resolvedPath).toBe(htmlPath)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('注册目录为 HTML 文件所在目录，入口路径仅包含文件名', () => {
    const dir = makeTempDir()
    try {
      const subDir = join(dir, 'sub')
      mkdirSync(subDir)
      const htmlPath = makeEmptyFile(subDir, 'page.html')
      const result = buildHtmlPreviewUrl(htmlPath, () => 'proma-file://tok')
      // rootDir = dirname(htmlPath) = .../sub, entry = relative(rootDir, htmlPath) = page.html
      expect(result.url).toBe('proma-file://tok/page.html')
      expect(result.resolvedPath).toBe(htmlPath)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('preload API 接线', () => {
  test('preload 中存在 prepareHtmlPreview 方法', () => {
    // 验证 preload 接口完整性：prepareHtmlPreview 作为 ElectronAPI 的成员存在
    const { readFileSync } = require('node:fs')
    const { join } = require('node:path')
    const preloadSource = readFileSync(join(import.meta.dir, '../preload/index.ts'), 'utf8')
    expect(preloadSource).toContain('prepareHtmlPreview')
    expect(preloadSource).toContain('IPC_CHANNELS.PREPARE_HTML_PREVIEW')
  })
})
