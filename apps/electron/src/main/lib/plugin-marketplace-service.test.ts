import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  addPluginMarketplace,
  installMarketplacePlugin,
  listPluginMarketplaces,
  refreshPluginMarketplace,
  searchMarketplacePlugins,
} from './plugin-marketplace-service.ts'

function tempRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'proma-plugin-marketplace-'))
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

function createMarketplace(root: string): string {
  const marketDir = join(root, 'market')
  const pluginDir = join(marketDir, 'plugins', 'frontend-design')
  mkdirSync(join(pluginDir, '.claude-plugin'), { recursive: true })
  mkdirSync(join(pluginDir, 'skills', 'frontend-design'), { recursive: true })
  writeFileSync(
    join(marketDir, 'marketplace.json'),
    JSON.stringify({
      id: 'ht-design',
      name: '华泰设计插件',
      plugins: [
        {
          name: 'frontend-design',
          source: './plugins/frontend-design',
          description: '前端设计规范',
          version: '1.0.0',
        },
      ],
    }),
    'utf-8',
  )
  writeFileSync(
    join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({
      name: 'frontend-design',
      version: '1.0.0',
      description: '前端设计规范',
    }),
    'utf-8',
  )
  writeFileSync(join(pluginDir, 'skills', 'frontend-design', 'SKILL.md'), '# Frontend Design', 'utf-8')
  return join(marketDir, 'marketplace.json')
}

describe('插件市场服务', () => {
  test('添加、刷新并搜索本地插件市场', async () => {
    const temp = tempRoot()
    try {
      const marketPath = createMarketplace(temp.root)
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const cacheDir = join(temp.root, 'cache')
      const userPluginsDir = join(temp.root, 'user-plugins')
      const pluginsConfigPath = join(temp.root, 'plugins.json')

      const servicePaths = { marketplacesPath, cacheDir, userPluginsDir, pluginsConfigPath }

      addPluginMarketplace({
        id: 'ht-design',
        name: '华泰设计插件',
        source: marketPath,
        type: 'local',
      }, servicePaths)

      await refreshPluginMarketplace('ht-design', servicePaths)
      const results = await searchMarketplacePlugins('frontend', servicePaths)

      expect(listPluginMarketplaces({ marketplacesPath })[0]?.id).toBe('ht-design')
      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('frontend-design')
      expect(results[0]?.installed).toBe(false)
    } finally {
      temp.cleanup()
    }
  })

  test('安装市场插件到 user-plugins 并写入启用状态', async () => {
    const temp = tempRoot()
    try {
      const marketPath = createMarketplace(temp.root)
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const cacheDir = join(temp.root, 'cache')
      const userPluginsDir = join(temp.root, 'user-plugins')
      const pluginsConfigPath = join(temp.root, 'plugins.json')

      const servicePaths = { marketplacesPath, cacheDir, userPluginsDir, pluginsConfigPath }

      addPluginMarketplace({
        id: 'ht-design',
        name: '华泰设计插件',
        source: marketPath,
        type: 'local',
      }, servicePaths)
      await refreshPluginMarketplace('ht-design', servicePaths)

      const result = await installMarketplacePlugin({
        marketplaceId: 'ht-design',
        pluginName: 'frontend-design',
        enable: true,
      }, servicePaths)

      const installedManifest = join(userPluginsDir, 'ht-design', 'frontend-design', '.claude-plugin', 'plugin.json')
      const config = JSON.parse(readFileSync(pluginsConfigPath, 'utf-8')) as { plugins: Record<string, { enabled: boolean }> }

      expect(result).toEqual({
        pluginId: 'user:ht-design/frontend-design',
        status: 'installed',
        enabled: true,
      })
      expect(existsSync(installedManifest)).toBe(true)
      expect(config.plugins['user:ht-design/frontend-design']?.enabled).toBe(true)
    } finally {
      temp.cleanup()
    }
  })

  test('安装远端插件时通过 cloneRepo 获取临时插件目录', async () => {
    const temp = tempRoot()
    try {
      const sourcePlugin = join(temp.root, 'remote-source')
      mkdirSync(join(sourcePlugin, '.claude-plugin'), { recursive: true })
      writeFileSync(
        join(sourcePlugin, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'remote-plugin', version: '1.0.0' }),
        'utf-8',
      )
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const cacheDir = join(temp.root, 'cache')
      const userPluginsDir = join(temp.root, 'user-plugins')
      const pluginsConfigPath = join(temp.root, 'plugins.json')
      const servicePaths = { marketplacesPath, cacheDir, userPluginsDir, pluginsConfigPath }
      const cloneCalls: string[] = []

      addPluginMarketplace({
        id: 'remote',
        name: '远端插件',
        source: 'https://example.com/marketplace.json',
        type: 'raw',
      }, servicePaths)
      mkdirSync(join(cacheDir, 'remote'), { recursive: true })
      writeFileSync(
        join(cacheDir, 'remote', 'manifest.json'),
        JSON.stringify({
          plugins: [{ name: 'remote-plugin', source: 'https://example.com/remote-plugin.git', version: '1.0.0' }],
        }),
        'utf-8',
      )

      await installMarketplacePlugin({
        marketplaceId: 'remote',
        pluginName: 'remote-plugin',
        enable: true,
      }, {
        ...servicePaths,
        cloneRepo: async (source, target) => {
          cloneCalls.push(source)
          mkdirSync(target, { recursive: true })
          return undefined
        },
        copyClonedFixture: sourcePlugin,
      })

      expect(cloneCalls).toEqual(['https://example.com/remote-plugin.git'])
      expect(existsSync(join(userPluginsDir, 'remote', 'remote-plugin', '.claude-plugin', 'plugin.json'))).toBe(true)
    } finally {
      temp.cleanup()
    }
  })

  test('GitHub 市场的相对插件路径解析为仓库内路径', async () => {
    const temp = tempRoot()
    try {
      const sourcePlugin = join(temp.root, 'remote-source')
      mkdirSync(join(sourcePlugin, '.claude-plugin'), { recursive: true })
      writeFileSync(
        join(sourcePlugin, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'frontend-design', version: '1.0.0' }),
        'utf-8',
      )
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const cacheDir = join(temp.root, 'cache')
      const userPluginsDir = join(temp.root, 'user-plugins')
      const pluginsConfigPath = join(temp.root, 'plugins.json')
      const servicePaths = { marketplacesPath, cacheDir, userPluginsDir, pluginsConfigPath }
      const cloneCalls: string[] = []

      addPluginMarketplace({
        id: 'github-market',
        name: 'GitHub 插件市场',
        source: 'https://github.com/org/plugins',
        type: 'github',
      }, servicePaths)
      mkdirSync(join(cacheDir, 'github-market'), { recursive: true })
      writeFileSync(
        join(cacheDir, 'github-market', 'manifest.json'),
        JSON.stringify({
          plugins: [{ name: 'frontend-design', source: './plugins/frontend-design', version: '1.0.0' }],
        }),
        'utf-8',
      )

      await installMarketplacePlugin({
        marketplaceId: 'github-market',
        pluginName: 'frontend-design',
        enable: true,
      }, {
        ...servicePaths,
        cloneRepo: async (source, target) => {
          cloneCalls.push(source)
          mkdirSync(target, { recursive: true })
          return undefined
        },
        copyClonedFixture: sourcePlugin,
      })

      expect(cloneCalls).toEqual(['https://github.com/org/plugins/plugins/frontend-design'])
    } finally {
      temp.cleanup()
    }
  })

  test('拒绝安装缺少 plugin.json 的目录', async () => {
    const temp = tempRoot()
    try {
      const badPlugin = join(temp.root, 'bad-plugin')
      mkdirSync(badPlugin, { recursive: true })
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const cacheDir = join(temp.root, 'cache')
      const userPluginsDir = join(temp.root, 'user-plugins')
      const pluginsConfigPath = join(temp.root, 'plugins.json')
      const servicePaths = { marketplacesPath, cacheDir, userPluginsDir, pluginsConfigPath }

      addPluginMarketplace({
        id: 'local',
        name: '本地插件',
        source: temp.root,
        type: 'local',
      }, servicePaths)
      mkdirSync(join(cacheDir, 'local'), { recursive: true })
      writeFileSync(
        join(cacheDir, 'local', 'manifest.json'),
        JSON.stringify({ plugins: [{ name: 'bad-plugin', source: './bad-plugin' }] }),
        'utf-8',
      )

      await expect(installMarketplacePlugin({
        marketplaceId: 'local',
        pluginName: 'bad-plugin',
        enable: true,
      }, servicePaths)).rejects.toThrow('缺少 .claude-plugin/plugin.json')
      expect(existsSync(join(userPluginsDir, 'local', 'bad-plugin'))).toBe(false)
    } finally {
      temp.cleanup()
    }
  })
})
