import { expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'PermissionModeSelector.tsx')).text()

test('权限模式选择器使用紧凑菜单列出三种模式', () => {
  expect(source).toContain('DropdownMenu')
  expect(source).toContain('DropdownMenuItem')
  expect(source).toContain('PROMA_PERMISSION_MODE_ORDER.map')
  expect(source).toContain('ChevronDown')
  expect(source).toContain('Check')
  expect(source).toContain('isSelected')
  expect(source).toContain('w-60')
  expect(source).not.toContain('DropdownMenuRadioGroup')
  expect(source).not.toContain('DropdownMenuRadioItem')
  expect(source).not.toContain('pl-8')
  expect(source).not.toContain('cycleMode')
})
