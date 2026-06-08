import { beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  clearConfigRootOverride,
  getConfigRootInfo,
  resolveConfigDir,
  resetConfigRoot,
  setConfigRoot,
} from './config-root-service'

function createTempHome(): string {
  return join(tmpdir(), `proma-config-root-${crypto.randomUUID()}`)
}

describe('config-root-service', () => {
  beforeEach(() => {
    clearConfigRootOverride()
  })

  test('未配置 bootstrap 时返回默认数据目录', () => {
    const homeDir = createTempHome()
    const info = getConfigRootInfo({ homeDir, configDirName: '.workmate-dev' })

    expect(info.defaultPath).toBe(join(homeDir, '.workmate-dev'))
    expect(info.currentPath).toBe(join(homeDir, '.workmate-dev'))
    expect(info.customPath).toBeUndefined()
    expect(info.pendingPath).toBeUndefined()
    expect(info.requiresRestart).toBe(false)
  })

  test('bootstrap 配置存在且合法时使用自定义数据目录', () => {
    const homeDir = createTempHome()
    const customDir = join(homeDir, 'proma-data')
    mkdirSync(join(homeDir, '.workmate-dev'), { recursive: true })
    writeFileSync(
      join(homeDir, '.workmate-dev', 'config-root.json'),
      JSON.stringify({ customConfigDir: customDir }),
      'utf-8'
    )

    const configDir = resolveConfigDir({ homeDir, configDirName: '.workmate-dev' })

    expect(configDir).toBe(customDir)
    expect(existsSync(customDir)).toBe(true)
  })

  test('bootstrap JSON 损坏时回退默认数据目录', () => {
    const homeDir = createTempHome()
    mkdirSync(join(homeDir, '.workmate-dev'), { recursive: true })
    writeFileSync(join(homeDir, '.workmate-dev', 'config-root.json'), '{broken', 'utf-8')

    const configDir = resolveConfigDir({ homeDir, configDirName: '.workmate-dev' })

    expect(configDir).toBe(join(homeDir, '.workmate-dev'))
  })

  test('拒绝保存相对路径作为自定义数据目录', () => {
    const homeDir = createTempHome()

    expect(() => setConfigRoot('relative/path', { homeDir, configDirName: '.workmate-dev' }))
      .toThrow('数据目录必须是绝对路径')
  })

  test('保存后当前进程仍使用原目录并标记重启后生效', () => {
    const homeDir = createTempHome()
    const customDir = join(homeDir, 'proma-data')
    clearConfigRootOverride()
    const currentDir = resolveConfigDir({ homeDir, configDirName: '.workmate-dev' })

    const info = setConfigRoot(customDir, { homeDir, configDirName: '.workmate-dev' })
    const bootstrap = JSON.parse(readFileSync(join(homeDir, '.workmate-dev', 'config-root.json'), 'utf-8')) as { customConfigDir: string }

    expect(currentDir).toBe(join(homeDir, '.workmate-dev'))
    expect(info.currentPath).toBe(join(homeDir, '.workmate-dev'))
    expect(info.pendingPath).toBe(customDir)
    expect(info.requiresRestart).toBe(true)
    expect(bootstrap.customConfigDir).toBe(customDir)
  })

  test('保存后模拟完整进程重启会使用新目录并清除待生效状态', () => {
    const homeDir = createTempHome()
    const customDir = join(homeDir, 'proma-data')
    resolveConfigDir({ homeDir, configDirName: '.workmate-dev' })
    setConfigRoot(customDir, { homeDir, configDirName: '.workmate-dev' })

    clearConfigRootOverride()
    const info = getConfigRootInfo({ homeDir, configDirName: '.workmate-dev' })

    expect(info.currentPath).toBe(customDir)
    expect(info.pendingPath).toBeUndefined()
    expect(info.requiresRestart).toBe(false)
  })

  test('reset 后恢复默认目录配置', () => {
    const homeDir = createTempHome()
    const customDir = join(homeDir, 'proma-data')
    setConfigRoot(customDir, { homeDir, configDirName: '.workmate-dev' })

    const info = resetConfigRoot({ homeDir, configDirName: '.workmate-dev' })

    expect(info.customPath).toBeUndefined()
    expect(info.pendingPath).toBeUndefined()
    expect(info.requiresRestart).toBe(false)
  })

  test('当前进程使用自定义目录时 reset 标记重启后恢复默认', () => {
    const homeDir = createTempHome()
    const customDir = join(homeDir, 'proma-data')
    mkdirSync(join(homeDir, '.workmate-dev'), { recursive: true })
    writeFileSync(
      join(homeDir, '.workmate-dev', 'config-root.json'),
      JSON.stringify({ customConfigDir: customDir }),
      'utf-8'
    )
    expect(resolveConfigDir({ homeDir, configDirName: '.workmate-dev' })).toBe(customDir)

    const info = resetConfigRoot({ homeDir, configDirName: '.workmate-dev' })

    expect(info.currentPath).toBe(customDir)
    expect(info.customPath).toBeUndefined()
    expect(info.pendingPath).toBe(join(homeDir, '.workmate-dev'))
    expect(info.requiresRestart).toBe(true)
  })
})
