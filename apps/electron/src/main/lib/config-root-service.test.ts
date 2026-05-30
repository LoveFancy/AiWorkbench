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
    const info = getConfigRootInfo({ homeDir, configDirName: '.proma-dev' })

    expect(info.defaultPath).toBe(join(homeDir, '.proma-dev'))
    expect(info.currentPath).toBe(join(homeDir, '.proma-dev'))
    expect(info.customPath).toBeUndefined()
    expect(info.pendingPath).toBeUndefined()
    expect(info.requiresRestart).toBe(false)
  })

  test('bootstrap 配置存在且合法时使用自定义数据目录', () => {
    const homeDir = createTempHome()
    const customDir = join(homeDir, 'proma-data')
    mkdirSync(join(homeDir, '.proma-dev'), { recursive: true })
    writeFileSync(
      join(homeDir, '.proma-dev', 'config-root.json'),
      JSON.stringify({ customConfigDir: customDir }),
      'utf-8'
    )

    const configDir = resolveConfigDir({ homeDir, configDirName: '.proma-dev' })

    expect(configDir).toBe(customDir)
    expect(existsSync(customDir)).toBe(true)
  })

  test('bootstrap JSON 损坏时回退默认数据目录', () => {
    const homeDir = createTempHome()
    mkdirSync(join(homeDir, '.proma-dev'), { recursive: true })
    writeFileSync(join(homeDir, '.proma-dev', 'config-root.json'), '{broken', 'utf-8')

    const configDir = resolveConfigDir({ homeDir, configDirName: '.proma-dev' })

    expect(configDir).toBe(join(homeDir, '.proma-dev'))
  })

  test('拒绝保存相对路径作为自定义数据目录', () => {
    const homeDir = createTempHome()

    expect(() => setConfigRoot('relative/path', { homeDir, configDirName: '.proma-dev' }))
      .toThrow('数据目录必须是绝对路径')
  })

  test('保存后当前进程仍使用原目录并标记重启后生效', () => {
    const homeDir = createTempHome()
    const customDir = join(homeDir, 'proma-data')
    clearConfigRootOverride()
    const currentDir = resolveConfigDir({ homeDir, configDirName: '.proma-dev' })

    const info = setConfigRoot(customDir, { homeDir, configDirName: '.proma-dev' })
    const bootstrap = JSON.parse(readFileSync(join(homeDir, '.proma-dev', 'config-root.json'), 'utf-8')) as { customConfigDir: string }

    expect(currentDir).toBe(join(homeDir, '.proma-dev'))
    expect(info.currentPath).toBe(join(homeDir, '.proma-dev'))
    expect(info.pendingPath).toBe(customDir)
    expect(info.requiresRestart).toBe(true)
    expect(bootstrap.customConfigDir).toBe(customDir)
  })

  test('reset 后恢复默认目录配置', () => {
    const homeDir = createTempHome()
    const customDir = join(homeDir, 'proma-data')
    setConfigRoot(customDir, { homeDir, configDirName: '.proma-dev' })

    const info = resetConfigRoot({ homeDir, configDirName: '.proma-dev' })

    expect(info.customPath).toBeUndefined()
    expect(info.pendingPath).toBeUndefined()
    expect(info.requiresRestart).toBe(false)
  })

  test('当前进程使用自定义目录时 reset 标记重启后恢复默认', () => {
    const homeDir = createTempHome()
    const customDir = join(homeDir, 'proma-data')
    mkdirSync(join(homeDir, '.proma-dev'), { recursive: true })
    writeFileSync(
      join(homeDir, '.proma-dev', 'config-root.json'),
      JSON.stringify({ customConfigDir: customDir }),
      'utf-8'
    )
    expect(resolveConfigDir({ homeDir, configDirName: '.proma-dev' })).toBe(customDir)

    const info = resetConfigRoot({ homeDir, configDirName: '.proma-dev' })

    expect(info.currentPath).toBe(customDir)
    expect(info.customPath).toBeUndefined()
    expect(info.pendingPath).toBe(join(homeDir, '.proma-dev'))
    expect(info.requiresRestart).toBe(true)
  })
})
