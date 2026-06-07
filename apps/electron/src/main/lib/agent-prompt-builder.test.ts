import { describe, expect, test } from 'bun:test'

import { buildSystemPrompt } from './agent-prompt-builder.ts'
import { BUILTIN_DEFAULT_PROMPT_STRING } from '@proma/shared'

describe('系统根提示词', () => {
  test('Agent 根提示词要求可见思考过程优先使用中文', () => {
    const prompt = buildSystemPrompt({
      sessionId: 'test-session',
      permissionMode: 'bypassPermissions',
      memoryEnabled: false,
      claudeAvailable: true,
    })

    expect(prompt).toContain('可见思考过程、推理摘要和最终回复都优先使用中文')
    expect(prompt).toContain('## 语言规则')
    expect(prompt).toContain('`thinking`、`thinking block`、`reasoning`')
    expect(prompt.indexOf('## 语言规则')).toBeLessThan(prompt.indexOf('## 工具使用指南'))
  })

  test('Agent 根提示词要求缺少 Python 环境时使用内置安装 Skill', () => {
    const prompt = buildSystemPrompt({
      sessionId: 'test-session',
      permissionMode: 'bypassPermissions',
      memoryEnabled: false,
      claudeAvailable: true,
    })

    expect(prompt).toContain('需要 Python 环境')
    expect(prompt).toContain('install-python')
    expect(prompt).toContain('不要自行拼装 Python 安装流程')
  })

  test('Agent 根提示词要求需要外部实时信息时主动使用联网检索 Skill', () => {
    const prompt = buildSystemPrompt({
      sessionId: 'test-session',
      permissionMode: 'bypassPermissions',
      memoryEnabled: false,
      claudeAvailable: true,
    })

    expect(prompt).toContain('## 联网检索策略')
    expect(prompt).toContain('当前、近期、外部公开信息')
    expect(prompt).toContain('web-search')
    expect(prompt).toContain('不要编造外部信息')
  })

  test('Agent 根提示词限制非多模态模型读取图片并要求文档通过 Skill 读取', () => {
    const prompt = buildSystemPrompt({
      sessionId: 'test-session',
      permissionMode: 'bypassPermissions',
      memoryEnabled: false,
      claudeAvailable: true,
    })

    expect(prompt).toContain('## 多模态与文档读取规则')
    expect(prompt).toContain('如果当前模型不支持多模态图片理解，不要尝试读取、解析或描述图片内容')
    expect(prompt).toContain('saas-kimi-k25、saas-qwen35-397b、local-qwen36-27b、saas-glm-51、saas-kimi-k26')
    expect(prompt).toContain('docx、pdf、pptx、xlsx')
    expect(prompt).toContain('必须优先通过对应 Skill 读取或转换')
  })

  test('Chat 内置提示词要求可见思考过程优先使用中文', () => {
    expect(BUILTIN_DEFAULT_PROMPT_STRING).toContain('可见思考过程、推理摘要和最终回复都优先使用中文')
    expect(BUILTIN_DEFAULT_PROMPT_STRING).toContain('`thinking`、`thinking block`、`reasoning`')
  })
})
