import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'ChannelForm.tsx')).text()

describe('ChannelForm 多模态能力开关', () => {
  test('已启用模型行使用纯文本/多模态分段切换', () => {
    expect(source).toContain('handleToggleModelMultimodal')
    expect(source).toContain('function ModelCapabilityToggle')
    expect(source).toContain("aria-label=\"模型能力\"")
    expect(source).toContain("aria-pressed={!supportsMultimodal}")
    expect(source).toContain("aria-pressed={supportsMultimodal}")
    expect(source).toContain('切换模型是否支持多模态图片理解')
  })

  test('测试模型按钮提供明确可点击样式', () => {
    expect(source).toContain('cursor-pointer')
    expect(source).toContain('hover:bg-primary/10')
    expect(source).toContain('测试模型')
  })
})
