import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'ChannelForm.tsx')).text()

describe('ChannelForm 多模态能力开关', () => {
  test('已启用模型行提供多模态/纯文本切换按钮', () => {
    expect(source).toContain('handleToggleModelMultimodal')
    expect(source).toContain("model.supportsMultimodal ? '多模态' : '纯文本'")
    expect(source).toContain('切换模型是否支持多模态图片理解')
  })
})
