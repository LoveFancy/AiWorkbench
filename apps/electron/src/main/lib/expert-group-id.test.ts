import { expect, test } from 'bun:test'
import { normalizeDeclaredExpertGroupId } from './plugin-registry-service'

test('裸 id 原样返回', () => {
  expect(normalizeDeclaredExpertGroupId('legal-compliance-reviewer')).toBe('legal-compliance-reviewer')
})

test('相对路径式声明剥离目录与 .json 后缀', () => {
  expect(normalizeDeclaredExpertGroupId('./expert-groups/legal-compliance-reviewer.json')).toBe('legal-compliance-reviewer')
})

test('无前缀但带 .json 后缀', () => {
  expect(normalizeDeclaredExpertGroupId('legal-compliance-reviewer.json')).toBe('legal-compliance-reviewer')
})

test('反斜杠路径分隔符也能处理', () => {
  expect(normalizeDeclaredExpertGroupId('expert-groups\\legal-compliance-reviewer.json')).toBe('legal-compliance-reviewer')
})

test('空白被裁剪', () => {
  expect(normalizeDeclaredExpertGroupId('  legal-compliance-reviewer  ')).toBe('legal-compliance-reviewer')
})
