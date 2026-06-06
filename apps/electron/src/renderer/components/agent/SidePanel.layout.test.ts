import { join } from 'node:path'
import { expect, test } from 'bun:test'

const sidePanelSource = await Bun.file(join(import.meta.dir, 'SidePanel.tsx')).text()

function expectDropZoneAfterFileTree(scrollMarker: string, dropZoneMarker: string): void {
  const scrollStart = sidePanelSource.indexOf(scrollMarker)
  const dropZoneStart = sidePanelSource.indexOf(dropZoneMarker)

  expect(scrollStart).toBeGreaterThanOrEqual(0)
  expect(dropZoneStart).toBeGreaterThanOrEqual(0)
  expect(dropZoneStart).toBeGreaterThan(scrollStart)

  const scrollAreaSource = sidePanelSource.slice(scrollStart, dropZoneStart)

  expect(scrollAreaSource).toContain('overflow-y-auto')
  expect(scrollAreaSource).toContain('<FileBrowser')
  expect(scrollAreaSource.trimEnd().endsWith('</div>')).toBe(false)
}

test('会话文件的添加入口紧跟在文件树后面', () => {
  expectDropZoneAfterFileTree(
    '{/* 会话文件内容区（独立滚动） */}',
    '{/* 会话文件拖拽上传区域 */}',
  )
})

test('工作区文件的添加入口紧跟在文件树后面', () => {
  expectDropZoneAfterFileTree(
    '{/* 工作区文件内容区（独立滚动） */}',
    '{/* 工作区文件拖拽上传区域 */}',
  )
})
