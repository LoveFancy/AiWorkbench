import { describe, expect, test } from 'bun:test'

import { inferMarketplaceInput } from './PluginSettings'

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
