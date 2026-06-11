import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const diffDir = import.meta.dir

function read(name: string): string {
  return readFileSync(join(diffDir, name), 'utf8')
}

describe('HTML 预览渲染接线', () => {
  test('HtmlPreviewFrame 使用 iframe、安全 sandbox、debounce 和错误态', () => {
    const path = join(diffDir, 'HtmlPreviewFrame.tsx')
    expect(existsSync(path)).toBe(true)
    const source = read('HtmlPreviewFrame.tsx')

    expect(source).toContain('prepareHtmlPreview')
    expect(source).toContain('setTimeout')
    expect(source).toContain('150')
    expect(source).toContain('sandbox="allow-scripts allow-same-origin allow-forms"')
    expect(source).toContain('onError')
    expect(source).toContain('重新加载')
  })

  test('PreviewContentRouter 让 previewKind=html 优先于 previewOnly', () => {
    const path = join(diffDir, 'PreviewContentRouter.tsx')
    expect(existsSync(path)).toBe(true)
    const source = read('PreviewContentRouter.tsx')

    expect(source).toContain("previewFile.previewKind === 'html'")
    expect(source).toContain('<HtmlPreviewFrame')
    expect(source).toContain('<DiffTabContent')
  })

  test('三个预览入口都使用 PreviewContentRouter', () => {
    expect(read('PreviewPanel.tsx')).toContain('PreviewContentRouter')
    expect(read('PreviewTabContent.tsx')).toContain('PreviewContentRouter')
    expect(read('DetachedPreviewApp.tsx')).toContain('PreviewContentRouter')
  })
})
