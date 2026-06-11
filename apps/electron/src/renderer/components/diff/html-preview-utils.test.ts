import { describe, expect, test } from 'bun:test'

import { isHtmlPreviewPath } from './html-preview-utils'

describe('HTML 预览路径识别', () => {
  test('识别 html 和 htm 文件', () => {
    expect(isHtmlPreviewPath('index.html')).toBe(true)
    expect(isHtmlPreviewPath('/tmp/page.htm')).toBe(true)
    expect(isHtmlPreviewPath('C:\\tmp\\PAGE.HTML')).toBe(true)
  })

  test('忽略非 HTML 文件和空路径', () => {
    expect(isHtmlPreviewPath('style.css')).toBe(false)
    expect(isHtmlPreviewPath('index.html.md')).toBe(false)
    expect(isHtmlPreviewPath('')).toBe(false)
  })
})
