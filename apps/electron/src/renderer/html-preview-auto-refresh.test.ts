import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const rendererDir = join(import.meta.dir)
const listenerSource = readFileSync(join(rendererDir, 'hooks/useGlobalAgentListeners.ts'), 'utf8')
const mainAreaSource = readFileSync(join(rendererDir, 'components/tabs/MainArea.tsx'), 'utf8')

describe('HTML 自动预览刷新和分栏宽度', () => {
  test('Agent 写 HTML 时标记 previewKind 并递增 previewRefreshVersionAtom', () => {
    expect(listenerSource).toContain('previewRefreshVersionAtom')
    expect(listenerSource).toContain('isHtmlPreviewPath')
    expect(listenerSource).toContain("previewKind: isHtml ? 'html' : 'file'")
    expect(listenerSource).toContain('previewOnly: previewOnly || isHtml')
  })

  test('分栏拖拽使用最小像素宽度限制而不是固定 0.3-0.8', () => {
    expect(mainAreaSource).toContain('MIN_CONVERSATION_WIDTH')
    expect(mainAreaSource).toContain('MIN_PREVIEW_WIDTH')
    expect(mainAreaSource).toContain('minRatio')
    expect(mainAreaSource).toContain('maxRatio')
    expect(mainAreaSource).not.toContain('Math.max(0.3, Math.min(0.8')
  })
})
