import { describe, expect, test } from 'bun:test'
import { getToolPhrase } from './tool-phrase'

describe('工具短语', () => {
  test('Skill 工具展示名隐藏工作区内部前缀', () => {
    expect(getToolPhrase('Skill', { skill: 'proma-workspace-default:docx' }).label).toBe('使用技能 docx')
    expect(getToolPhrase('Skill', { skill: 'docx' }).label).toBe('使用技能 docx')
  })
})
