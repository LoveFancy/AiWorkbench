import { join } from 'node:path'
import { expect, test } from 'bun:test'

const fileBrowserSource = await Bun.file(join(import.meta.dir, 'FileBrowser.tsx')).text()

test('嵌入模式的文件树不撑满外部滚动区域', () => {
  expect(fileBrowserSource).not.toContain("embedded && 'min-h-full'")
  expect(fileBrowserSource).toContain("embedded ? 'min-h-0' : 'h-full'")
})

test('目录行支持外部文件拖入选中并保存到该目录', () => {
  expect(fileBrowserSource).toContain('onExternalFilesDropToDirectory')
  expect(fileBrowserSource).toContain('eventHasExternalFiles(event)')
  expect(fileBrowserSource).toContain("event.dataTransfer.dropEffect = 'copy'")
  expect(fileBrowserSource).toContain('onDirectoryDropTargetActive?.()')
})
