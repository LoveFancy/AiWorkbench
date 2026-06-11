import { describe, expect, test } from 'bun:test'
import { PREVIEW_KIND, type PreviewFile } from '@/atoms/preview-atoms'

/**
 * 预览分发逻辑的纯函数实现。
 * 从 PreviewContentRouter 提取，避免 React 渲染依赖。
 */
function getPreviewRenderer(previewFile: PreviewFile): 'html' | 'diff' {
  if (previewFile.previewKind === PREVIEW_KIND.HTML) {
    return 'html'
  }
  return 'diff'
}

function makePreviewFile(overrides: Partial<PreviewFile> = {}): PreviewFile {
  return {
    filePath: '/tmp/test.html',
    previewKind: PREVIEW_KIND.FILE,
    previewOnly: false,
    ...overrides,
  }
}

describe('预览分发', () => {
  test('previewKind=html 时路由到 HTML 渲染器', () => {
    const file = makePreviewFile({ previewKind: PREVIEW_KIND.HTML, previewOnly: false })
    expect(getPreviewRenderer(file)).toBe('html')
  })

  test('previewKind=html 优先于 previewOnly=false', () => {
    const file = makePreviewFile({ previewKind: PREVIEW_KIND.HTML, previewOnly: false })
    // previewOnly false 时 diff 体系期望走 diff 渲染，但 previewKind 应优先
    expect(getPreviewRenderer(file)).toBe('html')
  })

  test('默认 previewKind 走 diff 渲染器', () => {
    const file = makePreviewFile({ previewKind: undefined })
    expect(getPreviewRenderer(file)).toBe('diff')
  })

  test('previewKind=file 走 diff 渲染器', () => {
    const file = makePreviewFile({ previewKind: PREVIEW_KIND.FILE })
    expect(getPreviewRenderer(file)).toBe('diff')
  })
})

describe('HtmlPreviewFrame 关键属性（结构验证）', () => {
  test('组件文件存在且导出为函数组件', async () => {
    const mod = await import('./HtmlPreviewFrame')
    expect(typeof mod.HtmlPreviewFrame).toBe('function')
  })

  test('sandbox 不包含 allow-popups', () => {
    const { readFileSync } = require('node:fs')
    const { join } = require('node:path')
    const source = readFileSync(join(import.meta.dir, 'HtmlPreviewFrame.tsx'), 'utf8')
    // sandbox 属性中不应包含 allow-popups（安全要求）
    expect(source).toContain('sandbox="allow-scripts allow-same-origin allow-forms"')
    expect(source).not.toContain('allow-popups')
  })
})
