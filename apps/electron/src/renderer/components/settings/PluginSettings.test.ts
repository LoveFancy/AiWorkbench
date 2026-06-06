import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { inferMarketplaceInput } from './PluginSettings'

const pluginSettingsSource = await Bun.file(join(import.meta.dir, 'PluginSettings.tsx')).text()

describe('插件市场输入推断', () => {
  test('owner/repo 简写按 GitHub 仓库处理', () => {
    expect(inferMarketplaceInput('topsecwp/ECC')).toEqual({
      id: 'ecc',
      name: 'ecc',
      source: 'https://github.com/topsecwp/ECC',
      type: 'github',
    })
  })

  test('Gitee 仓库地址自动识别为 gitee', () => {
    expect(inferMarketplaceInput('https://gitee.com/topsecwp/ECC')).toEqual({
      id: 'ecc',
      name: 'ecc',
      source: 'https://gitee.com/topsecwp/ECC',
      type: 'gitee',
    })
  })

  test('Gitee 仓库子目录地址自动识别读取分支', () => {
    expect(inferMarketplaceInput('https://gitee.com/lovefancy315/plugins-marketplace-all/tree/master/baoyu-skills')).toEqual({
      id: 'baoyu-skills',
      name: 'baoyu-skills',
      source: 'https://gitee.com/lovefancy315/plugins-marketplace-all/tree/master/baoyu-skills',
      type: 'gitee',
      branch: 'master',
    })
  })

  test('GitLab 仓库地址自动识别为 gitlab', () => {
    expect(inferMarketplaceInput('http://gitlab.htzq.htsc.com.cn/aidev/ht-dev-plugins/claudecode-plugin-marketplace')).toEqual({
      id: 'claudecode-plugin-marketplace',
      name: 'claudecode-plugin-marketplace',
      source: 'http://gitlab.htzq.htsc.com.cn/aidev/ht-dev-plugins/claudecode-plugin-marketplace',
      type: 'gitlab',
    })
  })

  test('直接 JSON URL 自动识别为 raw', () => {
    expect(inferMarketplaceInput('https://example.com/marketplace.json')).toMatchObject({
      id: 'marketplace',
      source: 'https://example.com/marketplace.json',
      type: 'raw',
    })
  })

  test('本地路径保持 local 类型', () => {
    expect(inferMarketplaceInput('./path/to/marketplace')).toMatchObject({
      id: 'marketplace',
      source: './path/to/marketplace',
      type: 'local',
    })
  })
})

describe('插件安装更新进行中状态', () => {
  test('安装和更新按钮点击后显示转圈并禁用，直到操作结束', () => {
    expect(pluginSettingsSource).toContain('Loader2')
    expect(pluginSettingsSource).toContain('pendingPluginOperations')
    expect(pluginSettingsSource).toContain('setPluginOperationPending')
    expect(pluginSettingsSource).toContain('isPending')
    expect(pluginSettingsSource).toContain('disabled={isPending}')
    expect(pluginSettingsSource).toContain('animate-spin')
  })
})

describe('插件市场分支配置', () => {
  test('添加和详情页使用中文文案配置读取分支', () => {
    expect(pluginSettingsSource).toContain('marketplaceBranchInput')
    expect(pluginSettingsSource).toContain('市场来源')
    expect(pluginSettingsSource).toContain('读取分支')
    expect(pluginSettingsSource).toContain('示例：')
    expect(pluginSettingsSource).not.toContain('Marketplace source')
    expect(pluginSettingsSource).not.toContain('Marketplace branch')
    expect(pluginSettingsSource).not.toContain('Examples:')
    expect(pluginSettingsSource).toContain('handleUpdateMarketplaceBranch')
    expect(pluginSettingsSource).toContain('marketplace.branch ??')
    expect(pluginSettingsSource).toContain('branch:')
  })
})
