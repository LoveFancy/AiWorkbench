import { expect, mock, test } from 'bun:test'
import { tmpdir } from 'node:os'
import type { ServerExpertGroupSummary } from '@proma/shared'
import type { HttpResponse } from '../../shared/hteip-client'

// 绕开 expert-remote-service 顶层导入链（hteip-client → auth → electron / config-paths → electron），
// 测试通过注入 get 驱动行为，无需真实依赖
mock.module('../../shared/hteip-client', () => ({
  httpGet: async () => ({ status: 0, ok: false, data: null }),
}))
mock.module('./config-paths', () => ({
  getConfigDir: () => tmpdir(),
  getExpertGroupsCachePath: () => '',
  getFeaturedScenesCachePath: () => '',
  getExpertGroupCategoriesCachePath: () => '',
}))

// 动态导入：确保在 mock.module 生效之后再解析模块导入链
const { fetchServerExpertGroupDetail } = await import('./expert-remote-service')

function makeSummary(overrides: Partial<ServerExpertGroupSummary> = {}): ServerExpertGroupSummary {
  return {
    id: 'product-team',
    name: '产品专家团',
    description: '描述',
    introduction: '介绍',
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
    version: '1.2.0',
    downloadUrl: '/workmate/expert-groups/product-team/download',
    downloadSize: 1024,
    sortWeight: 0,
    publishedAt: '',
    updatedAt: '',
    categories: [],
    ...overrides,
  }
}

test('成功响应（code=0）返回专家团详情', async () => {
  let calledPath = ''
  let calledOpts: unknown
  const fakeGet = async <T>(path: string, opts?: unknown): Promise<HttpResponse<T>> => {
    calledPath = path
    calledOpts = opts
    return { status: 200, ok: true, data: { code: 0, data: makeSummary() } as T }
  }

  const detail = await fetchServerExpertGroupDetail('product-team', fakeGet as never)

  expect(detail?.version).toBe('1.2.0')
  expect(calledPath).toBe('/workmate/expert-groups/group-detail/product-team')
  expect((calledOpts as { timeoutMs?: number })?.timeoutMs).toBe(1000)
})

test('请求超时/网络失败（ok=false）返回 null', async () => {
  const fakeGet = async <T>(): Promise<HttpResponse<T>> => {
    return { status: 0, ok: false, data: null, error: '请求超时' }
  }

  const detail = await fetchServerExpertGroupDetail('product-team', fakeGet as never)

  expect(detail).toBeNull()
})

test('业务错误码（code!=0）返回 null', async () => {
  const fakeGet = async <T>(): Promise<HttpResponse<T>> => {
    return { status: 200, ok: true, data: { code: 1, data: null } as T }
  }

  const detail = await fetchServerExpertGroupDetail('product-team', fakeGet as never)

  expect(detail).toBeNull()
})
