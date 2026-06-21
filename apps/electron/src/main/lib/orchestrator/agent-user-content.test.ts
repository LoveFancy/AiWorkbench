import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildAgentUserContent,
  resolveSupportedImageMediaType,
  validateImageSize,
} from './agent-user-content'
import { AGENT_IMAGE_INPUT_LIMITS } from '@proma/shared'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'proma-agent-image-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('Agent 用户多模态内容构造', () => {
  test('将支持的图片附件转换为 SDK image block', async () => {
    const dir = makeTempDir()
    const imagePath = join(dir, 'demo.png')
    writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))

    const result = await buildAgentUserContent({
      userMessage: '请描述这张图',
      attachments: [{ filename: 'demo.png', mediaType: 'image/png', path: imagePath }],
    })

    expect(result.content).toHaveLength(2)
    expect(result.content[0]).toEqual({ type: 'text', text: '请描述这张图' })
    expect(result.content[1]).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64'),
      },
    })
    expect(result.imageCount).toBe(1)
    expect(result.warnings).toEqual([])
  })

  test('非图片附件不生成 image block', async () => {
    const result = await buildAgentUserContent({
      userMessage: '<attached_files>\n- a.txt: /tmp/a.txt\n</attached_files>\n\n总结附件',
      attachments: [{ filename: 'a.txt', mediaType: 'text/plain', path: '/tmp/a.txt' }],
    })

    expect(result.content).toEqual([
      { type: 'text', text: '<attached_files>\n- a.txt: /tmp/a.txt\n</attached_files>\n\n总结附件' },
    ])
    expect(result.imageCount).toBe(0)
  })

  test('只为 SDK 支持的四类图片生成 media_type', () => {
    expect(resolveSupportedImageMediaType({ filename: 'a.jpg' })).toBe('image/jpeg')
    expect(resolveSupportedImageMediaType({ filename: 'a.jpeg' })).toBe('image/jpeg')
    expect(resolveSupportedImageMediaType({ filename: 'a.png' })).toBe('image/png')
    expect(resolveSupportedImageMediaType({ filename: 'a.gif' })).toBe('image/gif')
    expect(resolveSupportedImageMediaType({ filename: 'a.webp' })).toBe('image/webp')
    expect(resolveSupportedImageMediaType({ filename: 'a.bmp' })).toBeNull()
  })

  test('校验单图和单轮总量限制', () => {
    expect(validateImageSize({
      filename: 'big.png',
      sizeBytes: AGENT_IMAGE_INPUT_LIMITS.MAX_SINGLE_IMAGE_BYTES + 1,
      totalSizeBytes: 0,
    })).toEqual({
      ok: false,
      reason: '图片 big.png 超过单图大小限制 10MB',
    })

    expect(validateImageSize({
      filename: 'total.png',
      sizeBytes: 1024,
      totalSizeBytes: AGENT_IMAGE_INPUT_LIMITS.MAX_TOTAL_IMAGE_BYTES,
    })).toEqual({
      ok: false,
      reason: '图片附件总大小超过 20MB',
    })
  })
})
