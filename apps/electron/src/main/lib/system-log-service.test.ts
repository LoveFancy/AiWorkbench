import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readSystemLogFile } from './system-log-service.ts'

describe('system-log-service', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'proma-system-log-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('只读取日志文件尾部并标记截断状态', () => {
    writeFileSync(join(tempDir, 'main.log'), 'line-1\nline-2\nline-3\n', 'utf-8')

    const result = readSystemLogFile({ logsDir: tempDir, file: 'main', maxBytes: 14 })

    expect(result.exists).toBe(true)
    expect(result.file).toBe('main')
    expect(result.fileName).toBe('main.log')
    expect(result.content).toBe('line-2\nline-3\n')
    expect(result.sizeBytes).toBe(21)
    expect(result.readBytes).toBe(14)
    expect(result.truncated).toBe(true)
    expect(result.updatedAt).toBeGreaterThan(0)
  })

  test('日志文件不存在时返回空内容和目标路径', () => {
    const result = readSystemLogFile({ logsDir: tempDir, file: 'renderer', maxBytes: 1024 })

    expect(result.exists).toBe(false)
    expect(result.file).toBe('renderer')
    expect(result.fileName).toBe('renderer.log')
    expect(result.path).toBe(join(tempDir, 'renderer.log'))
    expect(result.content).toBe('')
    expect(result.sizeBytes).toBe(0)
    expect(result.readBytes).toBe(0)
    expect(result.truncated).toBe(false)
    expect(result.updatedAt).toBeNull()
  })
})
