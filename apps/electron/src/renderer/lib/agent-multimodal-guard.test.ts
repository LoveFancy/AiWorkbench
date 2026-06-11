import { describe, expect, test } from 'bun:test'

import type { Channel } from '@proma/shared'
import {
  agentModelSupportsMultimodal,
  extractPngFileMentions,
  findBlockedPngFiles,
  isImageAttachment,
  isPngAttachment,
  removeBlockedPngEntries,
} from './agent-multimodal-guard'

function channel(models: Array<{ id: string; name?: string; enabled?: boolean }>): Channel {
  return {
    id: 'agent-channel',
    name: 'Agent Channel',
    provider: 'anthropic',
    baseUrl: 'https://example.com',
    apiKey: 'encrypted',
    apiKeyConfigured: true,
    models: models.map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      enabled: model.enabled ?? true,
    })),
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  }
}

function channelWithMultimodal(
  models: Array<{ id: string; name?: string; supportsMultimodal?: boolean }>,
): Channel {
  return {
    ...channel([]),
    models: models.map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      enabled: true,
      supportsMultimodal: model.supportsMultimodal,
    })),
  }
}

describe('agent multimodal guard', () => {
  test('按扩展名或 MIME 类型识别图片附件', () => {
    // isPngAttachment（向后兼容，等同于 isImageAttachment）
    expect(isPngAttachment({ filename: 'demo.PNG' })).toBe(true)
    expect(isPngAttachment({ filename: '/tmp/demo.png' })).toBe(true)
    expect(isPngAttachment({ filename: 'clipboard', mediaType: 'image/png' })).toBe(true)
    expect(isPngAttachment({ filename: 'demo.jpg', mediaType: 'image/jpeg' })).toBe(true)
    expect(isPngAttachment({ filename: 'readme.md', mediaType: 'text/markdown' })).toBe(false)

    // isImageAttachment 覆盖所有图片格式
    expect(isImageAttachment({ filename: 'photo.jpg' })).toBe(true)
    expect(isImageAttachment({ filename: 'photo.JPEG' })).toBe(true)
    expect(isImageAttachment({ filename: 'photo.jpeG' })).toBe(true)
    expect(isImageAttachment({ filename: 'anim.gif' })).toBe(true)
    expect(isImageAttachment({ filename: 'icon.webp' })).toBe(true)
    expect(isImageAttachment({ filename: 'icon.bmp' })).toBe(true)
    expect(isImageAttachment({ filename: 'icon.svg' })).toBe(true)
    expect(isImageAttachment({ filename: 'doc.pdf' })).toBe(false)
    expect(isImageAttachment({ filename: 'readme.md' })).toBe(false)
  })

  test('只按模型显式 supportsMultimodal 字段判断多模态能力', () => {
    const channels = [
      channelWithMultimodal([
        { id: 'local-qwen36-27b', supportsMultimodal: true },
        { id: 'claude-3-5-sonnet-20241022' },
        { id: 'saas-deepseek-v32', supportsMultimodal: false },
      ]),
    ]

    expect(agentModelSupportsMultimodal(channels, 'agent-channel', 'local-qwen36-27b')).toBe(true)
    expect(agentModelSupportsMultimodal(channels, 'agent-channel', 'claude-3-5-sonnet-20241022')).toBe(false)
    expect(agentModelSupportsMultimodal(channels, 'agent-channel', 'saas-deepseek-v32')).toBe(false)
  })

  test('非多模态模型会找出需要阻止的图片文件名', () => {
    const files = [
      { filename: 'a.png', mediaType: 'image/png' },
      { filename: 'b.jpg', mediaType: 'image/jpeg' },
      { filename: 'c.md', mediaType: 'text/markdown' },
    ]

    expect(findBlockedPngFiles(files, false)).toEqual(['a.png', 'b.jpg'])
    expect(findBlockedPngFiles(files, true)).toEqual([])
  })

  test('非多模态模型过滤 @ 引用路径中的图片文件', () => {
    const entries = ['/workspace/a.png', '/workspace/b.jpg', '/workspace/c.md', '/workspace/d.PNG']

    expect(removeBlockedPngEntries(entries, false)).toEqual(['/workspace/c.md'])
    expect(removeBlockedPngEntries(entries, true)).toEqual(entries)
  })

  test('从消息正文中提取图片文件 Mention', () => {
    expect(extractPngFileMentions('看下 @file:/workspace/a.png 和 @file:/workspace/b.md')).toEqual(['/workspace/a.png'])
    expect(extractPngFileMentions('看下 @file:/workspace/my image.PNG 再继续')).toEqual(['/workspace/my image.PNG'])
    expect(extractPngFileMentions('看下 @file:/workspace/photo.jpg 和 @file:/workspace/doc.pdf')).toEqual(['/workspace/photo.jpg'])
    expect(extractPngFileMentions('看下 @file:/workspace/anim.gif 效果')).toEqual(['/workspace/anim.gif'])
  })
})
