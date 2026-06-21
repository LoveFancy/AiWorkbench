import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'

import {
  buildPluginMcpServers,
  buildPluginRuntimePaths,
  getPluginCapabilitySummary,
  installUserPluginZip,
  listInstalledPlugins,
  readPluginsConfig,
  setPluginEnabled,
  testPluginMcpServer,
  uninstallUserPlugin,
  updatePluginMcpEnv,
} from './plugin-registry-service.ts'

function tempRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'proma-plugin-registry-'))
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

function createPlugin(root: string, name: string, version = '1.0.0', mcpCommand = 'drawio'): string {
  const pluginDir = join(root, name)
  mkdirSync(join(pluginDir, '.claude-plugin'), { recursive: true })
  mkdirSync(join(pluginDir, 'skills', 'demo-skill'), { recursive: true })
  mkdirSync(join(pluginDir, 'commands'), { recursive: true })
  mkdirSync(join(pluginDir, 'agents'), { recursive: true })
  writeFileSync(
    join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({
      name,
      version,
      description: `${name} 描述`,
      author: { name: 'Qinxiao' },
      keywords: ['demo'],
    }),
    'utf-8',
  )
  writeFileSync(join(pluginDir, 'skills', 'demo-skill', 'SKILL.md'), '---\nname: demo-skill\n---\n# Demo', 'utf-8')
  writeFileSync(join(pluginDir, 'commands', 'demo.md'), '---\ndescription: Demo command\n---\nRun demo', 'utf-8')
  writeFileSync(join(pluginDir, 'agents', 'reviewer.md'), '---\ndescription: Demo agent\n---\nReview code', 'utf-8')
  writeFileSync(join(pluginDir, '.mcp.json'), JSON.stringify({ mcpServers: { drawio: { type: 'stdio', command: mcpCommand, env: { BASE: '1' } } } }), 'utf-8')
  return pluginDir
}

function createExpertPlugin(root: string, name: string, displayName = name): string {
  const pluginDir = createPlugin(root, name)
  mkdirSync(join(pluginDir, 'expert-groups'), { recursive: true })
  writeFileSync(
    join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({
      name: displayName,
      version: '1.0.0',
      description: `${displayName} 描述`,
      author: { name: 'Qinxiao' },
      keywords: ['expert'],
      expertGroup: 'product-team',
    }),
    'utf-8',
  )
  writeFileSync(
    join(pluginDir, 'expert-groups', 'product-team.json'),
    JSON.stringify({
      id: 'product-team',
      name: '产品专家团',
      mainRole: {
        name: '产品负责人',
        prompt: '你是产品专家团的主角色。',
      },
    }),
    'utf-8',
  )
  return pluginDir
}

describe('插件注册表服务', () => {
  test('扫描内置和用户插件并汇总能力', () => {
    const temp = tempRoot()
    try {
      const builtinDir = join(temp.root, 'default-plugins')
      const userDir = join(temp.root, 'user-plugins')
      const configPath = join(temp.root, 'plugins.json')
      createPlugin(builtinDir, 'dpmp-assist', '0.1.0')
      createPlugin(join(userDir, 'market'), 'frontend-design', '1.2.3')

      const plugins = listInstalledPlugins({ builtinDir, userDir, configPath })

      expect(plugins.map((plugin) => plugin.id)).toEqual([
        'builtin:dpmp-assist',
        'user:market/frontend-design',
      ])
      expect(plugins.every((plugin) => plugin.enabled)).toBe(true)
      expect(plugins.every((plugin) => plugin.category === 'general')).toBe(true)
      expect(plugins[0]?.capabilities.map((capability) => capability.type).sort()).toEqual(['agent', 'command', 'mcp', 'skill'])
      expect(plugins[1]?.sourceMarketplaceId).toBe('market')
    } finally {
      temp.cleanup()
    }
  })

  test('扫描插件声明的专家团能力', () => {
    const temp = tempRoot()
    try {
      const builtinDir = join(temp.root, 'default-plugins')
      const userDir = join(temp.root, 'user-plugins')
      const configPath = join(temp.root, 'plugins.json')
      createExpertPlugin(builtinDir, 'architecture-decision-team', '产品插件专家团')

      const plugins = listInstalledPlugins({ builtinDir, userDir, configPath })
      const expertCapabilities = plugins[0]?.capabilities.filter((capability) => capability.type === 'expert-group')

      expect(plugins[0]?.category).toBe('expert-group')
      expect(expertCapabilities).toEqual([
        {
          type: 'expert-group',
          name: 'product-team',
          sourcePluginId: 'builtin:architecture-decision-team',
          sourceLabel: '产品插件专家团',
          relativePath: 'expert-groups/product-team.json',
          description: '产品插件专家团',
          enabled: true,
        },
      ])
    } finally {
      temp.cleanup()
    }
  })

  test('每个插件最多暴露一个专家团能力', () => {
    const temp = tempRoot()
    try {
      const builtinDir = join(temp.root, 'default-plugins')
      const userDir = join(temp.root, 'user-plugins')
      const configPath = join(temp.root, 'plugins.json')
      const pluginDir = createExpertPlugin(builtinDir, 'architecture-decision-team')
      writeFileSync(
        join(pluginDir, '.claude-plugin', 'plugin.json'),
        JSON.stringify({
          name: '旧插件专家团',
          version: '1.0.0',
          expertGroups: ['product-team', 'architecture-team'],
        }),
        'utf-8',
      )
      writeFileSync(
        join(pluginDir, 'expert-groups', 'architecture-team.json'),
        JSON.stringify({
          id: 'architecture-team',
          name: '架构专家团',
          mainRole: { name: '架构师', prompt: '你是架构师。' },
        }),
        'utf-8',
      )

      const plugins = listInstalledPlugins({ builtinDir, userDir, configPath })
      const expertCapabilities = plugins[0]?.capabilities.filter((capability) => capability.type === 'expert-group') ?? []

      expect(expertCapabilities).toHaveLength(1)
      expect(expertCapabilities[0]).toMatchObject({
        name: 'product-team',
        relativePath: 'expert-groups/product-team.json',
      })
      expect(expertCapabilities[0]?.issue?.message).toContain('每个插件只能声明一个专家团')
    } finally {
      temp.cleanup()
    }
  })

  test('启用状态控制 runtime plugin path', () => {
    const temp = tempRoot()
    try {
      const builtinDir = join(temp.root, 'default-plugins')
      const userDir = join(temp.root, 'user-plugins')
      const configPath = join(temp.root, 'plugins.json')
      const builtinPluginPath = createPlugin(builtinDir, 'superpowers')
      const userPluginPath = createPlugin(join(userDir, 'market'), 'frontend-design')

      setPluginEnabled('builtin:superpowers', false, { builtinDir, userDir, configPath })

      const paths = buildPluginRuntimePaths({ builtinDir, userDir, configPath })

      expect(paths).toEqual([{ type: 'local', path: userPluginPath }])
      expect(paths.some((plugin) => plugin.path === builtinPluginPath)).toBe(false)
    } finally {
      temp.cleanup()
    }
  })

  test('普通 Agent runtime plugin path 默认排除专家团插件', () => {
    const temp = tempRoot()
    try {
      const builtinDir = join(temp.root, 'default-plugins')
      const userDir = join(temp.root, 'user-plugins')
      const configPath = join(temp.root, 'plugins.json')
      const normalPluginPath = createPlugin(builtinDir, 'dpmp-assist')
      const expertPluginPath = createExpertPlugin(builtinDir, 'architecture-decision-team', '架构决策专家团')

      const paths = buildPluginRuntimePaths({ builtinDir, userDir, configPath })

      expect(paths).toEqual([{ type: 'local', path: normalPluginPath }])
      expect(paths.some((plugin) => plugin.path === expertPluginPath)).toBe(false)
    } finally {
      temp.cleanup()
    }
  })

  test('同一市场下普通插件和专家团插件按插件目录独立分类并加载', () => {
    const temp = tempRoot()
    try {
      const builtinDir = join(temp.root, 'default-plugins')
      const userDir = join(temp.root, 'user-plugins')
      const configPath = join(temp.root, 'plugins.json')
      const normalPluginPath = createPlugin(join(userDir, 'ht-market'), 'normal-tools')
      const expertPluginPath = createExpertPlugin(join(userDir, 'ht-market'), 'product-expert-team', '产品专家团')

      const plugins = listInstalledPlugins({ builtinDir, userDir, configPath })
      const normal = plugins.find((plugin) => plugin.id === 'user:ht-market/normal-tools')
      const expert = plugins.find((plugin) => plugin.id === 'user:ht-market/product-expert-team')
      const paths = buildPluginRuntimePaths({ builtinDir, userDir, configPath })

      expect(normal?.category).toBe('general')
      expect(expert?.category).toBe('expert-group')
      expect(paths).toEqual([{ type: 'local', path: normalPluginPath }])
      expect(paths.some((plugin) => plugin.path === expertPluginPath)).toBe(false)
    } finally {
      temp.cleanup()
    }
  })

  test('显式请求时 runtime plugin path 可包含专家团插件', () => {
    const temp = tempRoot()
    try {
      const builtinDir = join(temp.root, 'default-plugins')
      const userDir = join(temp.root, 'user-plugins')
      const configPath = join(temp.root, 'plugins.json')
      const normalPluginPath = createPlugin(builtinDir, 'dpmp-assist')
      const expertPluginPath = createExpertPlugin(builtinDir, 'architecture-decision-team', '架构决策专家团')

      const paths = buildPluginRuntimePaths({ builtinDir, userDir, configPath, includeExpertGroupPlugins: true })

      expect(paths).toEqual([
        { type: 'local', path: expertPluginPath },
        { type: 'local', path: normalPluginPath },
      ])
    } finally {
      temp.cleanup()
    }
  })

  test('runtime plugin path 使用缓存副本承载插件 MCP env，不修改原插件目录', () => {
    const temp = tempRoot()
    try {
      const builtinDir = join(temp.root, 'default-plugins')
      const userDir = join(temp.root, 'user-plugins')
      const configPath = join(temp.root, 'plugins.json')
      const runtimeDir = join(temp.root, 'runtime-plugins')
      const pluginPath = createPlugin(builtinDir, 'dpmp-assist')
      updatePluginMcpEnv('builtin:dpmp-assist/drawio', { TOKEN: 'abc' }, { configPath })

      const paths = buildPluginRuntimePaths({ builtinDir, userDir, configPath, runtimeDir })
      const runtimePath = paths[0]?.path

      expect(runtimePath).not.toBe(pluginPath)
      expect(runtimePath?.startsWith(runtimeDir)).toBe(true)
      const runtimeMcp = JSON.parse(readFileSync(join(runtimePath ?? '', '.mcp.json'), 'utf-8')) as { mcpServers: { drawio: { env: Record<string, string> } } }
      const originalMcp = JSON.parse(readFileSync(join(pluginPath, '.mcp.json'), 'utf-8')) as { mcpServers: { drawio: { env: Record<string, string> } } }
      expect(runtimeMcp.mcpServers.drawio.env).toEqual({ BASE: '1', TOKEN: 'abc' })
      expect(originalMcp.mcpServers.drawio.env).toEqual({ BASE: '1' })
    } finally {
      temp.cleanup()
    }
  })

  test('保存插件 MCP 环境变量到 plugins.json', () => {
    const temp = tempRoot()
    try {
      const configPath = join(temp.root, 'plugins.json')

      updatePluginMcpEnv('builtin:dpmp-assist/drawio', { TOKEN: 'abc' }, { configPath })

      const config = readPluginsConfig({ configPath })
      expect(config.version).toBe(1)
      expect(config.mcpServers['builtin:dpmp-assist/drawio']?.env).toEqual({ TOKEN: 'abc' })
    } finally {
      temp.cleanup()
    }
  })

  test('能力摘要标记 command 冲突', () => {
    const temp = tempRoot()
    try {
      const builtinDir = join(temp.root, 'default-plugins')
      const userDir = join(temp.root, 'user-plugins')
      const configPath = join(temp.root, 'plugins.json')
      createPlugin(builtinDir, 'dpmp-assist')
      createPlugin(join(userDir, 'market'), 'frontend-design')

      const summary = getPluginCapabilitySummary({ builtinDir, userDir, configPath })
      const commands = summary.capabilities.filter((capability) => capability.type === 'command' && capability.name === 'demo')

      expect(commands).toHaveLength(2)
      expect(commands.every((command) => command.conflict)).toBe(true)
      expect(commands.flatMap((command) => command.conflictWith ?? [])).toContain('builtin:dpmp-assist')
      expect(commands.flatMap((command) => command.conflictWith ?? [])).toContain('user:market/frontend-design')
    } finally {
      temp.cleanup()
    }
  })

  test('构建插件 MCP 运行时配置时只包含已启用插件并合并用户 env', () => {
    const temp = tempRoot()
    try {
      const builtinDir = join(temp.root, 'default-plugins')
      const userDir = join(temp.root, 'user-plugins')
      const configPath = join(temp.root, 'plugins.json')
      createPlugin(builtinDir, 'dpmp-assist')
      createPlugin(builtinDir, 'disabled-plugin')

      setPluginEnabled('builtin:disabled-plugin', false, { builtinDir, userDir, configPath })
      updatePluginMcpEnv('builtin:dpmp-assist/drawio', { TOKEN: 'abc' }, { configPath })

      const servers = buildPluginMcpServers({ builtinDir, userDir, configPath })

      expect(Object.keys(servers)).toEqual(['builtin_dpmp-assist__drawio'])
      expect(servers['builtin_dpmp-assist__drawio']).toMatchObject({
        type: 'stdio',
        command: 'drawio',
        env: {
          BASE: '1',
          TOKEN: 'abc',
        },
      })
    } finally {
      temp.cleanup()
    }
  })

  test('测试插件 MCP 会写回最近一次测试结果', async () => {
    const temp = tempRoot()
    try {
      const builtinDir = join(temp.root, 'default-plugins')
      const userDir = join(temp.root, 'user-plugins')
      const configPath = join(temp.root, 'plugins.json')
      createPlugin(builtinDir, 'dpmp-assist', '1.0.0', '/path/not-exists-proma-mcp')

      const result = await testPluginMcpServer('builtin:dpmp-assist/drawio', { builtinDir, userDir, configPath })
      const config = readPluginsConfig({ configPath })

      expect(result.success).toBe(false)
      expect(result.message).toContain('命令不存在或不可执行')
      expect(config.mcpServers['builtin:dpmp-assist/drawio']?.lastTestSuccess).toBe(false)
      expect(config.mcpServers['builtin:dpmp-assist/drawio']?.lastTestMessage).toContain('命令不存在或不可执行')
    } finally {
      temp.cleanup()
    }
  })

  test('卸载用户插件时拒绝路径穿越 ID', () => {
    const temp = tempRoot()
    try {
      expect(() => uninstallUserPlugin('user:market/../secret', {
        builtinDir: join(temp.root, 'default-plugins'),
        userDir: join(temp.root, 'user-plugins'),
        configPath: join(temp.root, 'plugins.json'),
      })).toThrow('非法插件 ID')
    } finally {
      temp.cleanup()
    }
  })

  test('从 zip 直接安装用户插件到 local 分组', () => {
    const temp = tempRoot()
    try {
      const sourceDir = createPlugin(temp.root, 'uploaded-plugin', '1.2.0')
      const zipPath = join(temp.root, 'uploaded-plugin.zip')
      const zip = new AdmZip()
      zip.addLocalFolder(sourceDir, 'uploaded-plugin')
      zip.writeZip(zipPath)

      const installed = installUserPluginZip(zipPath, {
        builtinDir: join(temp.root, 'default-plugins'),
        userDir: join(temp.root, 'user-plugins'),
        configPath: join(temp.root, 'plugins.json'),
      })

      expect(installed.id).toBe('user:local/uploaded-plugin')
      expect(installed.sourceMarketplaceId).toBe('local')
      expect(installed.version).toBe('1.2.0')
      expect(installed.capabilities.map((capability) => capability.type).sort()).toEqual(['agent', 'command', 'mcp', 'skill'])
    } finally {
      temp.cleanup()
    }
  })

  test('zip 安装使用目录名作为插件 ID，manifest name 作为展示名', () => {
    const temp = tempRoot()
    try {
      const sourceDir = createExpertPlugin(temp.root, 'architecture-decision-team', '架构决策专家团')
      const zipPath = join(temp.root, 'architecture-decision-team.zip')
      const zip = new AdmZip()
      zip.addLocalFolder(sourceDir, 'architecture-decision-team')
      zip.writeZip(zipPath)

      const installed = installUserPluginZip(zipPath, {
        builtinDir: join(temp.root, 'default-plugins'),
        userDir: join(temp.root, 'user-plugins'),
        configPath: join(temp.root, 'plugins.json'),
      })

      expect(installed.id).toBe('user:local/architecture-decision-team')
      expect(installed.name).toBe('架构决策专家团')
      expect(installed.capabilities.find((capability) => capability.type === 'expert-group')).toMatchObject({
        sourceLabel: '架构决策专家团',
        description: '架构决策专家团',
      })
    } finally {
      temp.cleanup()
    }
  })

  test('上传用户插件 zip 时拒绝重复的专家团 ID', () => {
    const temp = tempRoot()
    try {
      const builtinDir = join(temp.root, 'default-plugins')
      const userDir = join(temp.root, 'user-plugins')
      const configPath = join(temp.root, 'plugins.json')
      createExpertPlugin(builtinDir, 'builtin-architecture-team', '内置架构专家团')
      const sourceDir = createExpertPlugin(temp.root, 'uploaded-architecture-team', '上传架构专家团')
      const zipPath = join(temp.root, 'uploaded-architecture-team.zip')
      const zip = new AdmZip()
      zip.addLocalFolder(sourceDir, 'uploaded-architecture-team')
      zip.writeZip(zipPath)

      expect(() => installUserPluginZip(zipPath, {
        builtinDir,
        userDir,
        configPath,
      })).toThrow('已存在相同专家团 ID: product-team')
    } finally {
      temp.cleanup()
    }
  })

  test('直接安装用户插件 zip 时拒绝缺少 manifest 的包', () => {
    const temp = tempRoot()
    try {
      const zipPath = join(temp.root, 'bad-plugin.zip')
      const zip = new AdmZip()
      zip.addFile('bad-plugin/README.md', Buffer.from('# Bad', 'utf-8'))
      zip.writeZip(zipPath)

      expect(() => installUserPluginZip(zipPath, {
        builtinDir: join(temp.root, 'default-plugins'),
        userDir: join(temp.root, 'user-plugins'),
        configPath: join(temp.root, 'plugins.json'),
      })).toThrow('必须包含 .claude-plugin/plugin.json')
    } finally {
      temp.cleanup()
    }
  })
})
