import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectAgentReadableFileKind, guardToolUseBeforePermission, looksLikeBase64BinaryRead, type RunToolGuardContext } from './agent-tool-read-guard'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'proma-read-guard-'))
  tempDirs.push(dir)
  return dir
}

function context(overrides: Partial<RunToolGuardContext> = {}): RunToolGuardContext {
  return {
    supportsMultimodal: false,
    autoModeEnabled: false,
    runHasImageInput: false,
    sessionRequiresVisionContext: false,
    canAutoSwitchToMultimodal: () => false,
    ...overrides,
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('agent-tool-read-guard', () => {
  test('拒绝 Read 光栅图片', () => {
    const dir = tempDir()
    const filePath = join(dir, 'image.bin')
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

    expect(detectAgentReadableFileKind(filePath)).toBe('raster_image')
    const result = guardToolUseBeforePermission('Read', { file_path: filePath }, context())

    expect(result?.behavior).toBe('deny')
    expect(result && 'message' in result ? result.message : '').toContain('当前模型不支持多模态图片理解')
  })

  test('允许 Read SVG 源码', () => {
    const dir = tempDir()
    const filePath = join(dir, 'icon.svg')
    writeFileSync(filePath, '<svg viewBox="0 0 10 10"></svg>')

    expect(detectAgentReadableFileKind(filePath)).toBe('svg_text')
    expect(guardToolUseBeforePermission('Read', { file_path: filePath }, context())).toBeNull()
  })

  test('拒绝 Read PDF', () => {
    const dir = tempDir()
    const filePath = join(dir, 'renamed.txt')
    writeFileSync(filePath, Buffer.from('%PDF-1.7\n'))

    expect(detectAgentReadableFileKind(filePath)).toBe('pdf')
    const result = guardToolUseBeforePermission('Read', { file_path: filePath }, context())

    expect(result?.behavior).toBe('deny')
    expect(result && 'message' in result ? result.message : '').toContain('文档不能通过 Read/base64 直接读取')
  })

  test('拒绝 Bash base64 读取图片', () => {
    const dir = tempDir()
    const filePath = join(dir, 'photo.png')
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

    expect(looksLikeBase64BinaryRead(`base64 ${filePath}`)).toBe(true)
    const result = guardToolUseBeforePermission('Bash', { command: `base64 ${filePath}` }, context())

    expect(result?.behavior).toBe('deny')
    expect(result && 'message' in result ? result.message : '').toContain('禁止使用 base64')
  })

  test('拒绝 WebFetch 直接获取图片 URL', () => {
    const result = guardToolUseBeforePermission('WebFetch', { url: 'https://example.com/image.webp' }, context())

    expect(result?.behavior).toBe('deny')
    expect(result && 'message' in result ? result.message : '').toContain('WebFetch 不能把图片')
  })
})
