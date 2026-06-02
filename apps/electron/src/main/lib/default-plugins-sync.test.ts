import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { syncDefaultPluginsFromDir } from './config-paths.ts'

function tempRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'proma-default-plugins-'))
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

function createPlugin(root: string, name: string, version: string, marker: string): void {
  const pluginDir = join(root, name)
  mkdirSync(join(pluginDir, '.claude-plugin'), { recursive: true })
  writeFileSync(join(pluginDir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name, version }), 'utf-8')
  writeFileSync(join(pluginDir, 'marker.txt'), marker, 'utf-8')
}

describe('默认插件同步', () => {
  test('本地版本较新或相等时不覆盖', () => {
    const temp = tempRoot()
    try {
      const bundledDir = join(temp.root, 'bundled')
      const targetDir = join(temp.root, 'default-plugins')
      createPlugin(bundledDir, 'superpowers', '1.0.0', 'bundled')
      createPlugin(targetDir, 'superpowers', '1.0.0', 'local-change')

      syncDefaultPluginsFromDir(bundledDir, targetDir)

      expect(readFileSync(join(targetDir, 'superpowers', 'marker.txt'), 'utf-8')).toBe('local-change')
    } finally {
      temp.cleanup()
    }
  })

  test('bundle 版本更新时覆盖目标插件', () => {
    const temp = tempRoot()
    try {
      const bundledDir = join(temp.root, 'bundled')
      const targetDir = join(temp.root, 'default-plugins')
      createPlugin(bundledDir, 'superpowers', '1.1.0', 'bundled')
      createPlugin(targetDir, 'superpowers', '1.0.0', 'local-change')

      syncDefaultPluginsFromDir(bundledDir, targetDir)

      expect(readFileSync(join(targetDir, 'superpowers', 'marker.txt'), 'utf-8')).toBe('bundled')
    } finally {
      temp.cleanup()
    }
  })

  test('目标缺失时复制插件', () => {
    const temp = tempRoot()
    try {
      const bundledDir = join(temp.root, 'bundled')
      const targetDir = join(temp.root, 'default-plugins')
      createPlugin(bundledDir, 'dpmp-assist', '0.1.0', 'bundled')

      syncDefaultPluginsFromDir(bundledDir, targetDir)

      expect(existsSync(join(targetDir, 'dpmp-assist', '.claude-plugin', 'plugin.json'))).toBe(true)
    } finally {
      temp.cleanup()
    }
  })
})
