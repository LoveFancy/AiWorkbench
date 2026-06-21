import { expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'PermissionModeSelector.tsx')).text()

test('权限模式选择器使用下拉单选列出三种模式', () => {
  expect(source).toContain('DropdownMenu')
  expect(source).toContain('DropdownMenuRadioGroup')
  expect(source).toContain('DropdownMenuRadioItem')
  expect(source).toContain('PROMA_PERMISSION_MODE_ORDER.map')
  expect(source).toContain('ChevronDown')
  expect(source).not.toContain('cycleMode')
})
