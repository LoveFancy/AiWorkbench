import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

const source = readFileSync(join(import.meta.dir, 'channel-manager.ts'), 'utf-8')

function extractFunctionBody(name: string): string {
  const start = source.indexOf(`export async function ${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const nextSection = source.indexOf('\n// =====', start + 1)
  return source.slice(start, nextSection === -1 ? undefined : nextSection)
}

test('测试模型请求必须显式直连，不读取应用代理配置', () => {
  const body = extractFunctionBody('testChannelModelDirect')
  expect(source).toContain("import { createDirectFetch, getFetchFn } from './proxy-fetch'")
  expect(body).toContain('createDirectFetch()')
  expect(body).not.toContain('getEffectiveProxyUrl()')
  expect(body).not.toContain('getFetchFn(proxyUrl)')
})
