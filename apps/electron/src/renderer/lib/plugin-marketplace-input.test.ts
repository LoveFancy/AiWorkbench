import { describe, expect, test } from 'bun:test'

import { inferMarketplaceInput, supportsMarketplaceBranch } from './plugin-marketplace-input'

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

  test('只有 Git 仓库型市场支持配置读取分支', () => {
    expect(supportsMarketplaceBranch('github')).toBe(true)
    expect(supportsMarketplaceBranch('gitee')).toBe(true)
    expect(supportsMarketplaceBranch('gitlab')).toBe(true)
    expect(supportsMarketplaceBranch('raw')).toBe(false)
    expect(supportsMarketplaceBranch('local')).toBe(false)
  })
})
