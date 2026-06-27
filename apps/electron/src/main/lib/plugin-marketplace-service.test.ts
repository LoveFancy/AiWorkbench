import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  addAndRefreshPluginMarketplace,
  addPluginMarketplace,
  getMarketplacePluginDetail,
  installMarketplacePlugin,
  listPluginMarketplaces,
  refreshPluginMarketplace,
  searchMarketplacePlugins,
} from './plugin-marketplace-service.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

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

  test('添加插件市场刷新失败时不保留失败市场', async () => {
    const temp = tempRoot()
    try {
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const servicePaths = {
        marketplacesPath,
        cacheDir: join(temp.root, 'cache'),
        userPluginsDir: join(temp.root, 'user-plugins'),
        pluginsConfigPath: join(temp.root, 'plugins.json'),
      }

      await expect(addAndRefreshPluginMarketplace({
        id: 'broken-market',
        name: 'Broken Market',
        source: join(temp.root, 'missing-marketplace.json'),
        type: 'local',
      }, servicePaths))
        .rejects
        .toThrow()

      expect(listPluginMarketplaces({ marketplacesPath })).toHaveLength(0)
    } finally {
      temp.cleanup()
    }
  })

  test('刷新本地仓库目录时读取 .claude-plugin/marketplace.json', async () => {
    const temp = tempRoot()
    try {
      const repoDir = join(temp.root, 'ppt-master')
      mkdirSync(join(repoDir, '.claude-plugin'), { recursive: true })
      mkdirSync(join(repoDir, 'skills', '.claude-plugin'), { recursive: true })
      mkdirSync(join(repoDir, 'skills', 'ppt-master'), { recursive: true })
      writeFileSync(
        join(repoDir, '.claude-plugin', 'marketplace.json'),
        JSON.stringify({
          name: 'ppt-master',
          plugins: [
            {
              name: 'ppt-master',
              source: {
                source: 'git-subdir',
                url: 'https://github.com/hugohe3/ppt-master.git',
                path: 'skills',
              },
              description: 'PPT Master skill',
            },
          ],
        }),
        'utf-8',
      )
      writeFileSync(
        join(repoDir, 'skills', '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'ppt-master', version: '2.7.0' }),
        'utf-8',
      )
      writeFileSync(join(repoDir, 'skills', 'ppt-master', 'SKILL.md'), '# PPT Master', 'utf-8')
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const cacheDir = join(temp.root, 'cache')
      const userPluginsDir = join(temp.root, 'user-plugins')
      const pluginsConfigPath = join(temp.root, 'plugins.json')
      const servicePaths = { marketplacesPath, cacheDir, userPluginsDir, pluginsConfigPath }

      addPluginMarketplace({
        id: 'ppt-master',
        name: 'ppt-master',
        source: repoDir,
        type: 'local',
      }, servicePaths)

      await refreshPluginMarketplace('ppt-master', servicePaths)
      const results = await searchMarketplacePlugins('ppt', servicePaths)

      expect(results).toHaveLength(1)
      expect(results[0]?.name).toBe('ppt-master')
    } finally {
      temp.cleanup()
    }
  })

  test('安装 git-subdir 来源的市场插件', async () => {
    const temp = tempRoot()
    try {
      const sourceRepo = join(temp.root, 'remote-source')
      const sourcePlugin = join(sourceRepo, 'skills')
      mkdirSync(join(sourcePlugin, '.claude-plugin'), { recursive: true })
      mkdirSync(join(sourcePlugin, 'ppt-master'), { recursive: true })
      writeFileSync(
        join(sourcePlugin, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'ppt-master', version: '2.7.0' }),
        'utf-8',
      )
      writeFileSync(join(sourcePlugin, 'ppt-master', 'SKILL.md'), '# PPT Master', 'utf-8')
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const cacheDir = join(temp.root, 'cache')
      const userPluginsDir = join(temp.root, 'user-plugins')
      const pluginsConfigPath = join(temp.root, 'plugins.json')
      const servicePaths = { marketplacesPath, cacheDir, userPluginsDir, pluginsConfigPath }
      const cloneCalls: string[] = []

      addPluginMarketplace({
        id: 'ppt-master',
        name: 'ppt-master',
        source: 'https://example.com/marketplace.json',
        type: 'raw',
      }, servicePaths)
      mkdirSync(join(cacheDir, 'ppt-master'), { recursive: true })
      writeFileSync(
        join(cacheDir, 'ppt-master', 'manifest.json'),
        JSON.stringify({
          plugins: [
            {
              name: 'ppt-master',
              source: {
                source: 'git-subdir',
                url: 'https://github.com/hugohe3/ppt-master.git',
                path: 'skills',
              },
              version: '2.7.0',
            },
          ],
        }),
        'utf-8',
      )

      await installMarketplacePlugin({
        marketplaceId: 'ppt-master',
        pluginName: 'ppt-master',
        enable: true,
      }, {
        ...servicePaths,
        cloneRepo: async (source, target) => {
          cloneCalls.push(source)
          mkdirSync(target, { recursive: true })
          return undefined
        },
        copyClonedFixture: sourceRepo,
      })

      expect(cloneCalls).toEqual(['https://github.com/hugohe3/ppt-master.git'])
      expect(existsSync(join(userPluginsDir, 'ppt-master', 'ppt-master', '.claude-plugin', 'plugin.json'))).toBe(true)
    } finally {
      temp.cleanup()
    }
  })

  test('本地仓库目录的 git-subdir 插件从本地子目录安装', async () => {
    const temp = tempRoot()
    try {
      const repoDir = join(temp.root, 'ppt-master')
      const sourcePlugin = join(repoDir, 'skills')
      mkdirSync(join(repoDir, '.claude-plugin'), { recursive: true })
      mkdirSync(join(sourcePlugin, '.claude-plugin'), { recursive: true })
      mkdirSync(join(sourcePlugin, 'ppt-master'), { recursive: true })
      writeFileSync(
        join(repoDir, '.claude-plugin', 'marketplace.json'),
        JSON.stringify({
          name: 'ppt-master',
          plugins: [
            {
              name: 'ppt-master',
              source: {
                source: 'git-subdir',
                url: 'https://github.com/hugohe3/ppt-master.git',
                path: 'skills',
              },
            },
          ],
        }),
        'utf-8',
      )
      writeFileSync(
        join(sourcePlugin, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'ppt-master', version: '2.7.0' }),
        'utf-8',
      )
      writeFileSync(join(sourcePlugin, 'ppt-master', 'SKILL.md'), '# PPT Master', 'utf-8')
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const cacheDir = join(temp.root, 'cache')
      const userPluginsDir = join(temp.root, 'user-plugins')
      const pluginsConfigPath = join(temp.root, 'plugins.json')
      const servicePaths = { marketplacesPath, cacheDir, userPluginsDir, pluginsConfigPath }

      addPluginMarketplace({
        id: 'ppt-master',
        name: 'ppt-master',
        source: repoDir,
        type: 'local',
      }, servicePaths)
      await refreshPluginMarketplace('ppt-master', servicePaths)

      await installMarketplacePlugin({
        marketplaceId: 'ppt-master',
        pluginName: 'ppt-master',
        enable: true,
      }, {
        ...servicePaths,
        cloneRepo: async () => {
          throw new Error('本地仓库市场不应 clone 远端')
        },
      })

      expect(existsSync(join(userPluginsDir, 'ppt-master', 'ppt-master', '.claude-plugin', 'plugin.json'))).toBe(true)
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

  test('安装 strict=false 的 Skill 集合条目时生成轻量插件目录', async () => {
    const temp = tempRoot()
    try {
      const marketDir = join(temp.root, 'market')
      mkdirSync(join(marketDir, 'skills', 'claude-api'), { recursive: true })
      writeFileSync(join(marketDir, 'skills', 'claude-api', 'SKILL.md'), '# Claude API', 'utf-8')
      writeFileSync(
        join(marketDir, 'marketplace.json'),
        JSON.stringify({
          name: 'anthropic-agent-skills',
          plugins: [
            {
              name: 'claude-api',
              source: './',
              strict: false,
              skills: ['./skills/claude-api'],
              description: 'Claude API documentation',
            },
          ],
        }),
        'utf-8',
      )
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const cacheDir = join(temp.root, 'cache')
      const userPluginsDir = join(temp.root, 'user-plugins')
      const pluginsConfigPath = join(temp.root, 'plugins.json')
      const servicePaths = { marketplacesPath, cacheDir, userPluginsDir, pluginsConfigPath }

      addPluginMarketplace({
        id: 'anthropic-agent-skills',
        name: '',
        source: join(marketDir, 'marketplace.json'),
        type: 'local',
      }, servicePaths)
      await refreshPluginMarketplace('anthropic-agent-skills', servicePaths)

      await installMarketplacePlugin({
        marketplaceId: 'anthropic-agent-skills',
        pluginName: 'claude-api',
        enable: true,
      }, servicePaths)

      const installedRoot = join(userPluginsDir, 'anthropic-agent-skills', 'claude-api')
      expect(existsSync(join(installedRoot, '.claude-plugin', 'plugin.json'))).toBe(true)
      expect(existsSync(join(installedRoot, 'skills', 'claude-api', 'SKILL.md'))).toBe(true)
    } finally {
      temp.cleanup()
    }
  })

  test('重复添加同 ID 插件市场时更新已有配置而不是抛错', () => {
    const temp = tempRoot()
    try {
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const servicePaths = {
        marketplacesPath,
        cacheDir: join(temp.root, 'cache'),
        userPluginsDir: join(temp.root, 'user-plugins'),
        pluginsConfigPath: join(temp.root, 'plugins.json'),
      }

      addPluginMarketplace({
        id: 'ECC',
        name: 'ECC',
        source: 'https://github.com/affaan-m/ecc',
        type: 'raw',
      }, servicePaths)
      addPluginMarketplace({
        id: 'ECC',
        name: 'ECC GitHub',
        source: 'https://github.com/affaan-m/ecc',
        type: 'github',
      }, servicePaths)

      const marketplaces = listPluginMarketplaces({ marketplacesPath })
      expect(marketplaces).toHaveLength(1)
      expect(marketplaces[0]?.name).toBe('ECC GitHub')
      expect(marketplaces[0]?.type).toBe('github')
      expect(marketplaces[0]?.enabled).toBe(true)
    } finally {
      temp.cleanup()
    }
  })

  test('重复添加同 ID 插件市场且未传认证配置时保留已有 Token', () => {
    const temp = tempRoot()
    try {
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const servicePaths = {
        marketplacesPath,
        cacheDir: join(temp.root, 'cache'),
        userPluginsDir: join(temp.root, 'user-plugins'),
        pluginsConfigPath: join(temp.root, 'plugins.json'),
        encryptToken: (token: string) => `encrypted:${token}`,
        decryptToken: (token: string) => token.replace(/^encrypted:/, ''),
      }

      addPluginMarketplace({
        id: 'private-market',
        name: 'Private Market',
        source: 'https://github.com/org/private-market',
        type: 'github',
        auth: { type: 'token', token: 'persist-secret' },
      }, servicePaths)
      addPluginMarketplace({
        id: 'private-market',
        name: 'Private Market Updated',
        source: 'https://github.com/org/private-market',
        type: 'github',
      }, servicePaths)

      const marketplace = listPluginMarketplaces({ marketplacesPath })[0]
      expect(marketplace?.auth).toEqual({ type: 'token', tokenConfigured: true })
      const stored = readFileSync(marketplacesPath, 'utf-8')
      expect(stored).toContain('encrypted:persist-secret')
    } finally {
      temp.cleanup()
    }
  })

  test('远端插件市场返回 HTML 时提示选择 GitHub 类型或 raw JSON URL', async () => {
    const temp = tempRoot()
    try {
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const servicePaths = {
        marketplacesPath,
        cacheDir: join(temp.root, 'cache'),
        userPluginsDir: join(temp.root, 'user-plugins'),
        pluginsConfigPath: join(temp.root, 'plugins.json'),
      }
      globalThis.fetch = (async () => new Response('<!DOCTYPE html><html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })) as unknown as typeof fetch

      addPluginMarketplace({
        id: 'ECC',
        name: 'ECC',
        source: 'https://github.com/affaan-m/ecc',
        type: 'raw',
      }, servicePaths)

      await expect(refreshPluginMarketplace('ECC', servicePaths))
        .rejects
        .toThrow('返回的是 HTML，不是插件市场 JSON')
    } finally {
      temp.cleanup()
    }
  })

  test('Gitee 地址误选 GitHub 类型时返回简短错误提示', async () => {
    const temp = tempRoot()
    try {
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const servicePaths = {
        marketplacesPath,
        cacheDir: join(temp.root, 'cache'),
        userPluginsDir: join(temp.root, 'user-plugins'),
        pluginsConfigPath: join(temp.root, 'plugins.json'),
      }
      globalThis.fetch = (async () => new Response('<!DOCTYPE html><html><title>你所访问的页面不存在 (404)</title><body>很长的 HTML</body></html>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })) as unknown as typeof fetch

      addPluginMarketplace({
        id: 'ECC',
        name: 'ECC',
        source: 'https://gitee.com/topsecwp/ECC',
        type: 'github',
      }, servicePaths)

      await expect(refreshPluginMarketplace('ECC', servicePaths))
        .rejects
        .toThrow('当前地址是 Gitee 仓库，请将市场类型改为 Gitee')
      const marketplace = listPluginMarketplaces({ marketplacesPath })[0]
      expect(marketplace?.lastError).toContain('读取插件市场失败 (404)')
      expect(marketplace?.lastError).not.toContain('<!DOCTYPE html>')
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
      const sourceRepo = join(temp.root, 'remote-source')
      const sourcePlugin = join(sourceRepo, 'plugins', 'frontend-design')
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
        copyClonedFixture: sourceRepo,
      })

      expect(cloneCalls).toEqual(['https://github.com/org/plugins'])
    } finally {
      temp.cleanup()
    }
  })

  test('GitHub 市场支持仓库根目录插件路径', async () => {
    const temp = tempRoot()
    try {
      const sourceRepo = join(temp.root, 'remote-source')
      mkdirSync(join(sourceRepo, '.claude-plugin'), { recursive: true })
      writeFileSync(
        join(sourceRepo, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'baoyu-skills', version: '1.0.0' }),
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
        source: 'https://github.com/org/baoyu-skills',
        type: 'github',
      }, servicePaths)
      mkdirSync(join(cacheDir, 'github-market'), { recursive: true })
      writeFileSync(
        join(cacheDir, 'github-market', 'manifest.json'),
        JSON.stringify({
          plugins: [{ name: 'baoyu-skills', source: './', version: '1.0.0' }],
        }),
        'utf-8',
      )

      await installMarketplacePlugin({
        marketplaceId: 'github-market',
        pluginName: 'baoyu-skills',
        enable: true,
      }, {
        ...servicePaths,
        cloneRepo: async (source, target) => {
          cloneCalls.push(source)
          mkdirSync(target, { recursive: true })
          return undefined
        },
        copyClonedFixture: sourceRepo,
      })

      expect(cloneCalls).toEqual(['https://github.com/org/baoyu-skills'])
      expect(existsSync(join(userPluginsDir, 'github-market', 'baoyu-skills', '.claude-plugin', 'plugin.json'))).toBe(true)
    } finally {
      temp.cleanup()
    }
  })

  test('市场详情对已安装插件返回本地发现能力', async () => {
    const temp = tempRoot()
    try {
      const sourceRepo = join(temp.root, 'remote-source')
      mkdirSync(join(sourceRepo, '.claude-plugin'), { recursive: true })
      mkdirSync(join(sourceRepo, 'skills', 'baoyu-article-illustrator'), { recursive: true })
      writeFileSync(
        join(sourceRepo, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'baoyu-skills', version: '1.0.0' }),
        'utf-8',
      )
      writeFileSync(
        join(sourceRepo, 'skills', 'baoyu-article-illustrator', 'SKILL.md'),
        '# Baoyu Article Illustrator\n\nAnalyzes article structure.',
        'utf-8',
      )
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const cacheDir = join(temp.root, 'cache')
      const userPluginsDir = join(temp.root, 'user-plugins')
      const pluginsConfigPath = join(temp.root, 'plugins.json')
      const servicePaths = { marketplacesPath, cacheDir, userPluginsDir, pluginsConfigPath }

      addPluginMarketplace({
        id: 'github-market',
        name: 'GitHub 插件市场',
        source: 'https://github.com/org/baoyu-skills',
        type: 'github',
      }, servicePaths)
      mkdirSync(join(cacheDir, 'github-market'), { recursive: true })
      writeFileSync(
        join(cacheDir, 'github-market', 'manifest.json'),
        JSON.stringify({
          plugins: [{ name: 'baoyu-skills', source: './', version: '1.0.0' }],
        }),
        'utf-8',
      )

      await installMarketplacePlugin({
        marketplaceId: 'github-market',
        pluginName: 'baoyu-skills',
        enable: true,
      }, {
        ...servicePaths,
        cloneRepo: async (_source, target) => {
          mkdirSync(target, { recursive: true })
          return undefined
        },
        copyClonedFixture: sourceRepo,
      })

      const detail = await getMarketplacePluginDetail('github-market', 'baoyu-skills', servicePaths)
      expect(detail.capabilities?.map((capability) => `${capability.type}:${capability.name}`)).toEqual(['skill:baoyu-article-illustrator'])
      expect(detail.manifest?.version).toBe('1.0.0')
    } finally {
      temp.cleanup()
    }
  })

  test('Gitee 市场仓库地址会解析到 raw marketplace.json', async () => {
    const temp = tempRoot()
    try {
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const servicePaths = {
        marketplacesPath,
        cacheDir: join(temp.root, 'cache'),
        userPluginsDir: join(temp.root, 'user-plugins'),
        pluginsConfigPath: join(temp.root, 'plugins.json'),
        encryptToken: (token: string) => `encrypted:${token}`,
        decryptToken: (token: string) => token.replace(/^encrypted:/, ''),
      }
      const requests: Array<{ url: string; authorization?: string }> = []
      globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const headers = new Headers(init?.headers)
        requests.push({ url: String(input), authorization: headers.get('authorization') ?? undefined })
        return new Response(JSON.stringify({
          name: 'ECC',
          plugins: [{ name: 'frontend-design', source: './plugins/frontend-design' }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }) as unknown as typeof fetch

      addPluginMarketplace({
        id: 'ecc',
        name: '',
        source: 'https://gitee.com/topsecwp/ECC',
        type: 'gitee',
        auth: { type: 'token', token: 'market-secret' },
      }, servicePaths)

      await refreshPluginMarketplace('ecc', servicePaths)

      expect(requests).toEqual([{
        url: 'https://gitee.com/topsecwp/ECC/raw/main/.claude-plugin/marketplace.json',
        authorization: 'Bearer market-secret',
      }])
      const marketplace = listPluginMarketplaces({ marketplacesPath })[0]
      expect(marketplace?.type).toBe('gitee')
      expect(marketplace?.auth).toEqual({ type: 'token', tokenConfigured: true })
      expect(JSON.stringify(marketplace)).not.toContain('encrypted:market-secret')
      const stored = readFileSync(marketplacesPath, 'utf-8')
      expect(stored).toContain('encrypted:market-secret')
      expect(stored).not.toContain('"market-secret"')
    } finally {
      temp.cleanup()
    }
  })

  test('安装远端市场插件时使用市场 Token 执行 git clone', async () => {
    const temp = tempRoot()
    try {
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const cacheDir = join(temp.root, 'cache')
      const userPluginsDir = join(temp.root, 'user-plugins')
      const pluginsConfigPath = join(temp.root, 'plugins.json')
      const sourceRepo = join(temp.root, 'source-repo')
      mkdirSync(join(sourceRepo, 'plugins', 'frontend-design', '.claude-plugin'), { recursive: true })
      mkdirSync(join(sourceRepo, 'plugins', 'frontend-design', 'skills', 'frontend-design'), { recursive: true })
      writeFileSync(
        join(sourceRepo, 'plugins', 'frontend-design', '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'frontend-design', version: '1.0.0' }),
        'utf-8',
      )
      writeFileSync(join(sourceRepo, 'plugins', 'frontend-design', 'skills', 'frontend-design', 'SKILL.md'), '# Frontend Design', 'utf-8')

      const cloneCalls: Array<{ source: string; authHeader?: string }> = []
      const servicePaths = {
        marketplacesPath,
        cacheDir,
        userPluginsDir,
        pluginsConfigPath,
        encryptToken: (token: string) => `encrypted:${token}`,
        decryptToken: (token: string) => token.replace(/^encrypted:/, ''),
        cloneRepo: async (source: string, targetDir: string, _branch?: string, authHeader?: string) => {
          cloneCalls.push({ source, authHeader })
          mkdirSync(targetDir, { recursive: true })
        },
        copyClonedFixture: sourceRepo,
      }

      addPluginMarketplace({
        id: 'github-private',
        name: 'GitHub Private',
        source: 'https://github.com/org/private-market',
        type: 'github',
        auth: { type: 'token', token: 'clone-secret' },
      }, servicePaths)
      mkdirSync(join(cacheDir, 'github-private'), { recursive: true })
      writeFileSync(
        join(cacheDir, 'github-private', 'manifest.json'),
        JSON.stringify({
          name: 'GitHub Private',
          plugins: [{ name: 'frontend-design', source: './plugins/frontend-design', version: '1.0.0' }],
        }),
        'utf-8',
      )

      await installMarketplacePlugin({
        marketplaceId: 'github-private',
        pluginName: 'frontend-design',
        enable: true,
      }, servicePaths)

      expect(cloneCalls).toEqual([{
        source: 'https://github.com/org/private-market',
        authHeader: 'Authorization: Bearer clone-secret',
      }])
      expect(existsSync(join(userPluginsDir, 'github-private', 'frontend-design', 'skills', 'frontend-design', 'SKILL.md'))).toBe(true)
    } finally {
      temp.cleanup()
    }
  })

  test('安装 Gitee 私有市场插件时使用 Git HTTPS 可识别的 Token 认证头', async () => {
    const temp = tempRoot()
    try {
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const cacheDir = join(temp.root, 'cache')
      const userPluginsDir = join(temp.root, 'user-plugins')
      const pluginsConfigPath = join(temp.root, 'plugins.json')
      const sourceRepo = join(temp.root, 'source-repo')
      mkdirSync(join(sourceRepo, 'plugins', 'ppt-master', '.claude-plugin'), { recursive: true })
      writeFileSync(
        join(sourceRepo, 'plugins', 'ppt-master', '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'ppt-master', version: '2.7.0' }),
        'utf-8',
      )

      const cloneCalls: Array<{ source: string; authHeader?: string }> = []
      const servicePaths = {
        marketplacesPath,
        cacheDir,
        userPluginsDir,
        pluginsConfigPath,
        encryptToken: (token: string) => `encrypted:${token}`,
        decryptToken: (token: string) => token.replace(/^encrypted:/, ''),
        cloneRepo: async (source: string, targetDir: string, _branch?: string, authHeader?: string) => {
          cloneCalls.push({ source, authHeader })
          mkdirSync(targetDir, { recursive: true })
        },
        copyClonedFixture: sourceRepo,
      }

      addPluginMarketplace({
        id: 'gitee-private',
        name: 'Gitee Private',
        source: 'https://gitee.com/lovefancy315/cc-plugins-marketplace',
        type: 'gitee',
        branch: 'master',
        auth: { type: 'token', token: 'gitee-secret' },
      }, servicePaths)
      mkdirSync(join(cacheDir, 'gitee-private'), { recursive: true })
      writeFileSync(
        join(cacheDir, 'gitee-private', 'manifest.json'),
        JSON.stringify({
          plugins: [{ name: 'ppt-master', source: './plugins/ppt-master', version: '2.7.0' }],
        }),
        'utf-8',
      )

      await installMarketplacePlugin({
        marketplaceId: 'gitee-private',
        pluginName: 'ppt-master',
        enable: true,
      }, servicePaths)

      expect(cloneCalls).toEqual([{
        source: 'https://gitee.com/lovefancy315/cc-plugins-marketplace',
        authHeader: `Authorization: Basic ${Buffer.from('oauth2:gitee-secret').toString('base64')}`,
      }])
    } finally {
      temp.cleanup()
    }
  })

  test('Gitee 市场子目录地址会解析到对应目录的 raw marketplace.json', async () => {
    const temp = tempRoot()
    try {
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const servicePaths = {
        marketplacesPath,
        cacheDir: join(temp.root, 'cache'),
        userPluginsDir: join(temp.root, 'user-plugins'),
        pluginsConfigPath: join(temp.root, 'plugins.json'),
      }
      const requestedUrls: string[] = []
      globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
        requestedUrls.push(String(input))
        return new Response(JSON.stringify({
          name: 'Baoyu Skills',
          plugins: [{ name: 'frontend-design', source: './plugins/frontend-design' }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }) as unknown as typeof fetch

      addPluginMarketplace({
        id: 'baoyu-skills',
        name: '',
        source: 'https://gitee.com/lovefancy315/plugins-marketplace-all/tree/master/baoyu-skills',
        type: 'gitee',
        branch: 'master',
      }, servicePaths)

      await refreshPluginMarketplace('baoyu-skills', servicePaths)

      expect(requestedUrls).toEqual(['https://gitee.com/lovefancy315/plugins-marketplace-all/raw/master/baoyu-skills/.claude-plugin/marketplace.json'])
      expect(listPluginMarketplaces({ marketplacesPath })[0]?.branch).toBe('master')
    } finally {
      temp.cleanup()
    }
  })

  test('GitLab 市场仓库地址会解析到 raw marketplace.json', async () => {
    const temp = tempRoot()
    try {
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const servicePaths = {
        marketplacesPath,
        cacheDir: join(temp.root, 'cache'),
        userPluginsDir: join(temp.root, 'user-plugins'),
        pluginsConfigPath: join(temp.root, 'plugins.json'),
      }
      const requestedUrls: string[] = []
      globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
        requestedUrls.push(String(input))
        return new Response(JSON.stringify({
          name: 'HT Dev Plugins',
          plugins: [{ name: 'frontend-design', source: './plugins/frontend-design' }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }) as unknown as typeof fetch

      addPluginMarketplace({
        id: 'ht-dev-plugins',
        name: '',
        source: 'http://gitlab.htzq.htsc.com.cn/aidev/ht-dev-plugins/claudecode-plugin-marketplace',
        type: 'gitlab',
      }, servicePaths)

      await refreshPluginMarketplace('ht-dev-plugins', servicePaths)

      expect(requestedUrls).toEqual(['http://gitlab.htzq.htsc.com.cn/aidev/ht-dev-plugins/claudecode-plugin-marketplace/-/raw/main/.claude-plugin/marketplace.json'])
      expect(listPluginMarketplaces({ marketplacesPath })[0]?.type).toBe('gitlab')
    } finally {
      temp.cleanup()
    }
  })

  test('GitLab 市场支持配置读取分支', async () => {
    const temp = tempRoot()
    try {
      const marketplacesPath = join(temp.root, 'plugin-marketplaces.json')
      const servicePaths = {
        marketplacesPath,
        cacheDir: join(temp.root, 'cache'),
        userPluginsDir: join(temp.root, 'user-plugins'),
        pluginsConfigPath: join(temp.root, 'plugins.json'),
      }
      const requestedUrls: string[] = []
      globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
        requestedUrls.push(String(input))
        return new Response(JSON.stringify({
          name: 'HT Dev Plugins',
          plugins: [{ name: 'frontend-design', source: './plugins/frontend-design' }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }) as unknown as typeof fetch

      addPluginMarketplace({
        id: 'ht-dev-plugins',
        name: '',
        source: 'http://gitlab.htzq.htsc.com.cn/aidev/ht-dev-plugins/claudecode-plugin-marketplace',
        type: 'gitlab',
        branch: 'master',
      }, servicePaths)

      await refreshPluginMarketplace('ht-dev-plugins', servicePaths)

      expect(requestedUrls).toEqual(['http://gitlab.htzq.htsc.com.cn/aidev/ht-dev-plugins/claudecode-plugin-marketplace/-/raw/master/.claude-plugin/marketplace.json'])
      expect(listPluginMarketplaces({ marketplacesPath })[0]?.branch).toBe('master')
    } finally {
      temp.cleanup()
    }
  })

  test('Gitee 市场的相对插件路径解析为仓库内路径', async () => {
    const temp = tempRoot()
    try {
      const sourceRepo = join(temp.root, 'remote-source')
      const sourcePlugin = join(sourceRepo, 'plugins', 'frontend-design')
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
        id: 'gitee-market',
        name: 'Gitee 插件市场',
        source: 'https://gitee.com/topsecwp/ECC',
        type: 'gitee',
      }, servicePaths)
      mkdirSync(join(cacheDir, 'gitee-market'), { recursive: true })
      writeFileSync(
        join(cacheDir, 'gitee-market', 'manifest.json'),
        JSON.stringify({
          plugins: [{ name: 'frontend-design', source: './plugins/frontend-design', version: '1.0.0' }],
        }),
        'utf-8',
      )

      await installMarketplacePlugin({
        marketplaceId: 'gitee-market',
        pluginName: 'frontend-design',
        enable: true,
      }, {
        ...servicePaths,
        cloneRepo: async (source, target) => {
          cloneCalls.push(source)
          mkdirSync(target, { recursive: true })
          return undefined
        },
        copyClonedFixture: sourceRepo,
      })

      expect(cloneCalls).toEqual(['https://gitee.com/topsecwp/ECC'])
    } finally {
      temp.cleanup()
    }
  })

  test('GitLab 市场的相对插件路径解析为仓库内路径', async () => {
    const temp = tempRoot()
    try {
      const sourceRepo = join(temp.root, 'remote-source')
      const sourcePlugin = join(sourceRepo, 'plugins', 'frontend-design')
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
        id: 'gitlab-market',
        name: 'GitLab 插件市场',
        source: 'http://gitlab.htzq.htsc.com.cn/aidev/ht-dev-plugins/claudecode-plugin-marketplace',
        type: 'gitlab',
      }, servicePaths)
      mkdirSync(join(cacheDir, 'gitlab-market'), { recursive: true })
      writeFileSync(
        join(cacheDir, 'gitlab-market', 'manifest.json'),
        JSON.stringify({
          plugins: [{ name: 'frontend-design', source: './plugins/frontend-design', version: '1.0.0' }],
        }),
        'utf-8',
      )

      await installMarketplacePlugin({
        marketplaceId: 'gitlab-market',
        pluginName: 'frontend-design',
        enable: true,
      }, {
        ...servicePaths,
        cloneRepo: async (source, target) => {
          cloneCalls.push(source)
          mkdirSync(target, { recursive: true })
          return undefined
        },
        copyClonedFixture: sourceRepo,
      })

      expect(cloneCalls).toEqual(['http://gitlab.htzq.htsc.com.cn/aidev/ht-dev-plugins/claudecode-plugin-marketplace'])
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
      }, servicePaths)).rejects.toThrow('source 字段是否指向完整插件目录')
      expect(existsSync(join(userPluginsDir, 'local', 'bad-plugin'))).toBe(false)
    } finally {
      temp.cleanup()
    }
  })
})
