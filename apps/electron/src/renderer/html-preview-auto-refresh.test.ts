import { describe, expect, test } from 'bun:test'
import { isHtmlPreviewPath } from '@/components/diff/html-preview-utils'
import { PREVIEW_KIND } from '@/atoms/preview-atoms'

/**
 * 模拟 buildAutoPreviewFile 的核心逻辑，验证 HTML 文件的识别和标记。
 */
function applyAutoPreviewKind(filePath: string, existingPreviewOnly?: boolean): {
  previewKind: typeof PREVIEW_KIND.FILE | typeof PREVIEW_KIND.HTML
  previewOnly: boolean
} {
  const isHtml = isHtmlPreviewPath(filePath)
  return {
    previewKind: isHtml ? PREVIEW_KIND.HTML : PREVIEW_KIND.FILE,
    previewOnly: (existingPreviewOnly ?? false) || isHtml,
  }
}

describe('HTML 自动预览识别', () => {
  test('.html 文件标记 previewKind=html', () => {
    const result = applyAutoPreviewKind('/work/index.html')
    expect(result.previewKind).toBe(PREVIEW_KIND.HTML)
  })

  test('.htm 文件标记 previewKind=html', () => {
    const result = applyAutoPreviewKind('/work/page.htm')
    expect(result.previewKind).toBe(PREVIEW_KIND.HTML)
  })

  test('.css 文件不标记为 html', () => {
    const result = applyAutoPreviewKind('/work/style.css')
    expect(result.previewKind).toBe(PREVIEW_KIND.FILE)
  })

  test('HTML 文件强制 previewOnly=true', () => {
    const result = applyAutoPreviewKind('/work/index.html', false)
    expect(result.previewOnly).toBe(true)
  })

  test('非 HTML 文件保留原有 previewOnly', () => {
    const result = applyAutoPreviewKind('/work/README.md', true)
    expect(result.previewOnly).toBe(true)
    expect(result.previewKind).toBe(PREVIEW_KIND.FILE)
  })
})

describe('分栏宽度约束', () => {
  const MIN_CONVERSATION_WIDTH = 360
  const MIN_PREVIEW_WIDTH = 320
  const MIN_SPLIT_RATIO = 0.15
  const MAX_SPLIT_RATIO = 0.9

  function computeSplitRatio(containerWidth: number, startRatio: number, deltaPx: number): number {
    const minRatio = Math.max(MIN_SPLIT_RATIO, MIN_CONVERSATION_WIDTH / containerWidth)
    const maxRatio = Math.min(MAX_SPLIT_RATIO, 1 - MIN_PREVIEW_WIDTH / containerWidth)
    const nextRatio = startRatio + deltaPx / containerWidth
    return Math.max(minRatio, Math.min(maxRatio, nextRatio))
  }

  test('在 1440px 容器中预览区最多可拉到约 78%', () => {
    const containerWidth = 1440
    // 拖到最右侧：startRatio 0.5, delta 拉到 maxRatio
    const ratio = computeSplitRatio(containerWidth, 0.5, containerWidth)
    // maxRatio = min(0.9, 1 - 320/1440) = min(0.9, 0.777...) ≈ 0.777
    expect(ratio).toBeCloseTo(1 - MIN_PREVIEW_WIDTH / containerWidth, 2)
    expect(ratio).toBeGreaterThan(0.7) // 预览区 > 70%
  })

  test('对话区最小宽度不低于 360px', () => {
    const containerWidth = 800
    // 拖到最左侧
    const ratio = computeSplitRatio(containerWidth, 0.5, -containerWidth)
    // minRatio = max(0.15, 360/800) = max(0.15, 0.45) = 0.45
    expect(ratio).toBe(MIN_CONVERSATION_WIDTH / containerWidth)
  })

  test('不会超出全局 0.15-0.9 边界', () => {
    // 很宽容器
    expect(computeSplitRatio(4000, 0.5, -4000)).toBe(0.15)
    // 2000px 容器中预览区最小为 320px → maxRatio = 1 - 320/2000 = 0.84
    expect(computeSplitRatio(2000, 0.5, 2000)).toBe(0.84)
  })
})
