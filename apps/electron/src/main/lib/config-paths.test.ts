import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { clearConfigDirNameForTest, resolveDefaultConfigBaseDir, resolveDefaultConfigDirName } from './config-paths'

function createTempHome(): string {
  return join(tmpdir(), `workmate-config-paths-${crypto.randomUUID()}`)
}

describe('配置目录默认名称', () => {
  afterEach(() => {
    delete process.env.PROMA_DEV
    clearConfigDirNameForTest()
  })

  test('新用户默认使用 WorkMate 数据目录', () => {
    const homeDir = createTempHome()

    expect(resolveDefaultConfigDirName(homeDir, '.workmate-dev', '.proma-dev')).toBe('.workmate-dev')
    expect(resolveDefaultConfigDirName(homeDir, '.workmate', '.proma')).toBe('.workmate')
  })

  test('老用户已有 Proma 数据目录时继续使用原目录', () => {
    const homeDir = createTempHome()
    mkdirSync(join(homeDir, '.proma-dev'), { recursive: true })
    mkdirSync(join(homeDir, '.proma'), { recursive: true })

    expect(resolveDefaultConfigDirName(homeDir, '.workmate-dev', '.proma-dev')).toBe('.proma-dev')
    expect(resolveDefaultConfigDirName(homeDir, '.workmate', '.proma')).toBe('.proma')
  })

  test('新旧目录同时存在时优先使用 WorkMate 目录', () => {
    const homeDir = createTempHome()
    mkdirSync(join(homeDir, '.proma'), { recursive: true })
    mkdirSync(join(homeDir, '.workmate'), { recursive: true })

    expect(resolveDefaultConfigDirName(homeDir, '.workmate', '.proma')).toBe('.workmate')
  })

  test('Windows 新用户默认把正式版 .workmate 放到 D 盘根目录', () => {
    const homeDir = createTempHome()

    expect(resolveDefaultConfigBaseDir(homeDir, '.workmate', 'win32', 'D:\\', true)).toBe('D:\\')
  })

  test('Windows 没有 D 盘时回退到用户目录，避免应用启动失败', () => {
    const homeDir = createTempHome()

    expect(resolveDefaultConfigBaseDir(homeDir, '.workmate', 'win32', 'D:\\', false)).toBe(homeDir)
  })

  test('Windows 已有用户数据目录时继续使用用户目录，避免自动迁移', () => {
    const homeDir = createTempHome()
    mkdirSync(join(homeDir, '.workmate'), { recursive: true })

    expect(resolveDefaultConfigBaseDir(homeDir, '.workmate', 'win32')).toBe(homeDir)
    expect(resolveDefaultConfigBaseDir(homeDir, '.proma', 'win32')).toBe(homeDir)
  })
})
