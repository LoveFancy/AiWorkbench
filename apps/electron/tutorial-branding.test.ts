import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

const tutorial = readFileSync(join(import.meta.dir, '../../tutorial/tutorial.md'), 'utf-8')

test('内置教程使用华泰自研 Agent 工具口径', () => {
  expect(tutorial).toContain('华泰自研 Agent 工具')
  expect(tutorial).toContain('秦晓012950')
})

test('内置教程包含非信息技术部首次使用前置申请说明', () => {
  expect(tutorial).toContain('168.63.65.40:8090')
  expect(tutorial).toContain('firewallapply')
  expect(tutorial).toContain('http://eip.htsc.com.cn/modelPlatform/#/apiManage/list')
  expect(tutorial).toContain('数智中台')
  expect(tutorial).toContain('黄宇海019543')
})

test('内置教程不暴露 Proma 开源和商业版来源信息', () => {
  expect(tutorial).not.toContain('Proma')
  expect(tutorial).not.toContain('Erlich')
  expect(tutorial).not.toContain('github.com/ErlichLiu')
  expect(tutorial).not.toContain('proma.cool')
  expect(tutorial).not.toContain('开源版本')
  expect(tutorial).not.toContain('商业版本')
})
