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

test('会话和工作区文件空白区点击会清空文件树选中状态', () => {
  const sessionMarker = '{/* 会话文件内容区（独立滚动） */}'
  const workspaceMarker = '{/* 工作区文件内容区（独立滚动） */}'
  const sessionStart = sidePanelSource.indexOf(sessionMarker)
  const workspaceStart = sidePanelSource.indexOf(workspaceMarker)

  expect(sessionStart).toBeGreaterThanOrEqual(0)
  expect(workspaceStart).toBeGreaterThanOrEqual(0)

  expect(sidePanelSource.slice(sessionStart, workspaceStart)).toContain('onClick={handleSessionFilesBlankClick}')
  expect(sidePanelSource.slice(workspaceStart)).toContain('onClick={handleWorkspaceFilesBlankClick}')
})
