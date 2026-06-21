import { expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'PermissionModeSelector.tsx')).text()

test('权限模式选择器使用受控 Popover 列出三种模式', () => {
  expect(source).toContain('<Popover open={open} onOpenChange={setOpen}>')
  expect(source).toContain('<Tooltip open={open ? false : undefined}>')
  expect(source).toContain('PopoverTrigger asChild')
  expect(source).toContain('PROMA_PERMISSION_MODE_ORDER.map')
  expect(source).toContain('ChevronDown')
  expect(source).not.toContain('cycleMode')
  expect(source).not.toContain('DropdownMenuTrigger')
})
