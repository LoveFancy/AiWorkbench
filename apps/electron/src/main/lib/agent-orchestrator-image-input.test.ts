import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'agent-orchestrator.ts')).text()

describe('Agent 图片多模态输入编排', () => {
  test('支持图片附件时为 SDK prompt 构造多模态内容但持久化仍保留文本', () => {
    expect(source).toContain("import { buildAgentUserContent } from './orchestrator/agent-user-content'")
    expect(source).toContain('const sdkPromptContent = runHasImageInput')
    expect(source).toContain('await buildAgentUserContent({ userMessage: finalPrompt, attachments })')
    expect(source).toContain('prompt: sdkPromptContent?.imageCount ? sdkPromptContent.content : finalPrompt')
    expect(source).toContain("content: [{ type: 'text', text: userMessage }]")
  })
})
