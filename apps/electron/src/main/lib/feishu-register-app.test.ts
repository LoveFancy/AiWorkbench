import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

const ipcSource = readFileSync(join(import.meta.dir, '../ipc.ts'), 'utf-8')
const httpClientSource = readFileSync(join(import.meta.dir, 'feishu-http-client.ts'), 'utf-8')

test('飞书扫码注册在调用 registerApp 前配置 SDK 默认 HTTP 实例', () => {
  expect(httpClientSource).toContain('configureFeishuDefaultHttpInstance')
  expect(ipcSource).toContain("import { configureFeishuDefaultHttpInstance } from './lib/feishu-http-client'")
  expect(ipcSource).toContain('await configureFeishuDefaultHttpInstance(lark.defaultHttpInstance)')
  expect(ipcSource.indexOf('await configureFeishuDefaultHttpInstance(lark.defaultHttpInstance)')).toBeLessThan(
    ipcSource.indexOf('await lark.registerApp({'),
  )
})
