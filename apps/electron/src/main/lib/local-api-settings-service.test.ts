import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEFAULT_LOCAL_API_SETTINGS,
  generateLocalApiToken,
  readLocalApiSettings,
  saveLocalApiSettings,
  verifyLocalApiToken,
} from './local-api-settings-service'

function tempSettingsPath(): { path: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'workmate-local-api-settings-'))
  return {
    path: join(root, 'local-api-settings.json'),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

describe('local-api-settings-service', () => {
  test('配置文件不存在时返回默认关闭的本地 API 设置', () => {
    const temp = tempSettingsPath()
    try {
      const settings = readLocalApiSettings(temp.path)

      expect(settings).toEqual(DEFAULT_LOCAL_API_SETTINGS)
      expect(settings.enabled).toBe(false)
      expect(settings.host).toBe('127.0.0.1')
      expect(settings.port).toBe(17373)
      expect(settings.apiTokenHash).toBeNull()
    } finally {
      temp.cleanup()
    }
  })

  test('保存设置时会归一化端口和远程访问地址', () => {
    const temp = tempSettingsPath()
    try {
      const saved = saveLocalApiSettings({
        ...DEFAULT_LOCAL_API_SETTINGS,
        allowRemoteAccess: false,
        host: '0.0.0.0',
        port: 99999,
      }, temp.path)

      expect(saved.host).toBe('127.0.0.1')
      expect(saved.port).toBe(17373)
      expect(readLocalApiSettings(temp.path)).toEqual(saved)
    } finally {
      temp.cleanup()
    }
  })

  test('不允许 bypassPermissions 时默认权限模式会回退到 auto', () => {
    const temp = tempSettingsPath()
    try {
      const saved = saveLocalApiSettings({
        ...DEFAULT_LOCAL_API_SETTINGS,
        defaultPermissionMode: 'bypassPermissions',
        allowBypassPermissions: false,
      }, temp.path)

      expect(saved.defaultPermissionMode).toBe('auto')
      expect(saved.allowBypassPermissions).toBe(false)
      expect(readLocalApiSettings(temp.path).defaultPermissionMode).toBe('auto')
    } finally {
      temp.cleanup()
    }
  })

  test('生成 token 后只保存哈希，不把明文写入配置文件', () => {
    const temp = tempSettingsPath()
    try {
      const result = generateLocalApiToken(temp.path)
      const raw = readFileSync(temp.path, 'utf-8')

      expect(result.token.length).toBeGreaterThanOrEqual(32)
      expect(result.settings.apiTokenHash).toBeTruthy()
      expect(raw).not.toContain(result.token)
      expect(verifyLocalApiToken(result.token, result.settings.apiTokenHash)).toBe(true)
      expect(verifyLocalApiToken(`${result.token}x`, result.settings.apiTokenHash)).toBe(false)
    } finally {
      temp.cleanup()
    }
  })

  test('读取损坏 JSON 时回退默认值且不创建新文件', () => {
    const temp = tempSettingsPath()
    try {
      Bun.write(temp.path, '{broken')
      const settings = readLocalApiSettings(temp.path)

      expect(settings).toEqual(DEFAULT_LOCAL_API_SETTINGS)
      expect(existsSync(temp.path)).toBe(true)
    } finally {
      temp.cleanup()
    }
  })
})
