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
    '{/* === 会话文件区域 === */}',
    'target="session"',
  )
})

test('工作区文件的添加入口紧跟在文件树后面', () => {
  expectDropZoneAfterFileTree(
    '{/* === 工作区文件区域 === */}',
    'target="workspace"',
  )
})

test('会话和工作区文件空白区点击会清空文件树选中状态', () => {
  const sessionMarker = '{/* === 会话文件区域 === */}'
  const workspaceMarker = '{/* === 工作区文件区域 === */}'
  const sessionStart = sidePanelSource.indexOf(sessionMarker)
  const workspaceStart = sidePanelSource.indexOf(workspaceMarker)

  expect(sessionStart).toBeGreaterThanOrEqual(0)
  expect(workspaceStart).toBeGreaterThanOrEqual(0)

  expect(sidePanelSource.slice(sessionStart, workspaceStart)).toContain('onClick={handleSessionFilesBlankClick}')
  expect(sidePanelSource.slice(workspaceStart)).toContain('onClick={handleWorkspaceFilesBlankClick}')
})

test('会话和工作区文件区域支持外部文件拖入和粘贴到根目录', () => {
  const sessionMarker = '{/* === 会话文件区域 === */}'
  const workspaceMarker = '{/* === 工作区文件区域 === */}'
  const sessionStart = sidePanelSource.indexOf(sessionMarker)
  const workspaceStart = sidePanelSource.indexOf(workspaceMarker)

  expect(sessionStart).toBeGreaterThanOrEqual(0)
  expect(workspaceStart).toBeGreaterThanOrEqual(0)

  const sessionSource = sidePanelSource.slice(sessionStart, workspaceStart)
  const workspaceSource = sidePanelSource.slice(workspaceStart)

  for (const source of [sessionSource, workspaceSource]) {
    expect(source).toContain('tabIndex={0}')
    expect(source).toContain('onDragOver={(event) => handleRootDragOver')
    expect(source).toContain('onDrop={(event) => handleRootDrop')
    expect(source).toContain('onPaste={(event) => handleFileAreaPaste')
    expect(source).toContain('passiveDuringDrag')
  }
})

test('附加目录树支持托管文件拖拽高亮和移动', () => {
  expect(sidePanelSource).toContain('onDirectoryDropTargetActive={clearDropZoneHighlight}')
  expect(sidePanelSource).toContain('eventHasFileTreeDrag(event)')
  expect(sidePanelSource).toContain('window.electronAPI.moveAttachedFile(path, currentPath')
  expect(sidePanelSource).toContain('window.electronAPI.moveAttachedFile(path, dirPath')
})
