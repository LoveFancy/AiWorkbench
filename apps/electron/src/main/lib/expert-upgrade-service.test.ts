import { expect, test } from 'bun:test'
import type { AgentPluginInfo, ServerExpertGroupSummary } from '@proma/shared'
import { ensureExpertGroupLatest, type EnsureExpertGroupLatestDeps } from './expert-upgrade-service'

function makeSummary(version: string): ServerExpertGroupSummary {
  return {
    id: 'product-team',
    name: '产品专家团',
    description: '',
    introduction: '',
    mainRoleName: '产品负责人',
    expertType: 'team',
    subagentCount: 1,
    subagents: [],
    subagentLabels: {},
    tags: [],
    samplePrompts: [],
    builtinTools: [],
    skills: [],
    mcpServers: [],
    version,
    downloadUrl: '',
    downloadSize: 0,
    sortWeight: 0,
    publishedAt: '',
    updatedAt: '',
    categories: [],
  }
}

function makePlugin(version: string): AgentPluginInfo {
  return {
    id: 'user:remote/product-team',
    kind: 'user',
    name: 'product-team',
    version,
    keywords: [],
    path: '/plugins/product-team',
    enabled: true,
    category: 'expert-group',
    capabilities: [],
    issues: [],
  }
}

test('服务端版本更高时下载并覆盖安装，返回 updated=true', async () => {
  let downloadId: string | undefined
  let downloadOverwrite: boolean | undefined
  const deps: EnsureExpertGroupLatestDeps = {
    fetchDetail: async () => makeSummary('2.0.0'),
    download: async (id, options) => { downloadId = id; downloadOverwrite = options.overwrite; return makePlugin('2.0.0') },
  }

  const result = await ensureExpertGroupLatest('product-team', '1.0.0', deps)

  expect(result.updated).toBe(true)
  expect(result.plugin?.version).toBe('2.0.0')
  expect(downloadId).toBe('product-team')
  expect(downloadOverwrite).toBe(true)
})

test('服务端版本相等时不下载，返回 updated=false', async () => {
  let downloadCalled = false
  const deps: EnsureExpertGroupLatestDeps = {
    fetchDetail: async () => makeSummary('1.0.0'),
    download: async () => { downloadCalled = true; return makePlugin('1.0.0') },
  }

  const result = await ensureExpertGroupLatest('product-team', '1.0.0', deps)

  expect(result.updated).toBe(false)
  expect(downloadCalled).toBe(false)
})

test('服务端版本更低时不下载，返回 updated=false', async () => {
  let downloadCalled = false
  const deps: EnsureExpertGroupLatestDeps = {
    fetchDetail: async () => makeSummary('0.9.0'),
    download: async () => { downloadCalled = true; return makePlugin('0.9.0') },
  }

  const result = await ensureExpertGroupLatest('product-team', '1.0.0', deps)

  expect(result.updated).toBe(false)
  expect(downloadCalled).toBe(false)
})

test('详情检查失败（null）时降级为本地版，不下载', async () => {
  let downloadCalled = false
  const deps: EnsureExpertGroupLatestDeps = {
    fetchDetail: async () => null,
    download: async () => { downloadCalled = true; return makePlugin('1.0.0') },
  }

  const result = await ensureExpertGroupLatest('product-team', '1.0.0', deps)

  expect(result.updated).toBe(false)
  expect(downloadCalled).toBe(false)
})

test('详情检查抛异常时降级为本地版，不抛出', async () => {
  const deps: EnsureExpertGroupLatestDeps = {
    fetchDetail: async () => { throw new Error('网络异常') },
    download: async () => makePlugin('2.0.0'),
  }

  const result = await ensureExpertGroupLatest('product-team', '1.0.0', deps)

  expect(result.updated).toBe(false)
})

test('下载抛异常时降级为本地版，不抛出', async () => {
  const deps: EnsureExpertGroupLatestDeps = {
    fetchDetail: async () => makeSummary('2.0.0'),
    download: async () => { throw new Error('下载失败') },
  }

  const result = await ensureExpertGroupLatest('product-team', '1.0.0', deps)

  expect(result.updated).toBe(false)
})

test('同一专家团并发调用仅触发一次详情检查与下载（in-flight 去重）', async () => {
  let fetchCount = 0
  let downloadCount = 0
  const deps: EnsureExpertGroupLatestDeps = {
    fetchDetail: async () => { fetchCount++; await Promise.resolve(); return makeSummary('2.0.0') },
    download: async () => { downloadCount++; return makePlugin('2.0.0') },
  }

  const [r1, r2] = await Promise.all([
    ensureExpertGroupLatest('product-team', '1.0.0', deps),
    ensureExpertGroupLatest('product-team', '1.0.0', deps),
  ])

  expect(r1.updated).toBe(true)
  expect(r2.updated).toBe(true)
  expect(fetchCount).toBe(1)
  expect(downloadCount).toBe(1)
})
