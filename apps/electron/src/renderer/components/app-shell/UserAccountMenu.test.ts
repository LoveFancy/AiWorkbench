import { expect, test } from 'bun:test'
import { join } from 'node:path'

const menuSource = await Bun.file(join(import.meta.dir, 'UserAccountMenu.tsx')).text()
const sidebarSource = await Bun.file(join(import.meta.dir, 'LeftSidebar.tsx')).text()
const appearanceSettingsSource = await Bun.file(join(import.meta.dir, '../settings/AppearanceSettings.tsx')).text()
const guestMenuSource = menuSource.slice(
  menuSource.indexOf('export function GuestAccountMenu'),
  menuSource.indexOf('function ThemeQuickSwitch'),
)
const expandedFooterStart = sidebarSource.indexOf('{/* 底部：账户中心入口 */}')
const expandedFooterSource = sidebarSource.slice(
  expandedFooterStart,
  sidebarSource.indexOf('{deleteDialog}', expandedFooterStart),
)

test('账户菜单提供精简的账户、设置、外观、更新和退出入口', () => {
  expect(menuSource).toContain('复制账号')
  expect(menuSource).toContain('使用手册')
  expect(menuSource).toContain('设置')
  expect(menuSource).toContain('外观')
  expect(menuSource).toContain('浅色')
  expect(menuSource).toContain('深色')
  expect(menuSource).toContain('帮助与反馈')
  expect(menuSource).toContain('检查更新')
  expect(menuSource).toContain('退出登录')
})

test('账户菜单不包含参考图中不需要的积分和活动模块', () => {
  expect(menuSource).not.toContain('Buddy 加油站')
  expect(menuSource).not.toContain('体验版')
  expect(menuSource).not.toContain('积分余额')
  expect(menuSource).not.toContain('成长计划')
  expect(menuSource).not.toContain('升级')
})

test('左侧栏复用同一个账户菜单组件，避免展开和收起状态重复实现', () => {
  expect(sidebarSource).toContain('UserAccountMenu')
  expect(sidebarSource).not.toContain('登录于')
  expect(sidebarSource).not.toContain('有效期至')
  expect(sidebarSource).not.toContain('已认证 ·')
})

test('未登录态不再使用旧的实心登录按钮样式', () => {
  expect(sidebarSource).toContain('GuestAccountMenu')
  expect(sidebarSource).not.toContain('flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-[10px] transition-all titlebar-no-drag bg-primary text-primary-foreground')
})

test('使用手册和问题反馈不再作为侧栏底部常驻按钮渲染', () => {
  expect(sidebarSource).not.toContain('<IssueReportButton />')
  expect(sidebarSource).not.toContain('<BookOpen className="size-5 flex-shrink-0" />')
})

test('账户弹窗的浅色快捷按钮切换到云朵舞者，深色快捷按钮切换到普通深色', () => {
  expect(menuSource).toContain('ThemeQuickSwitch')
  expect(menuSource).toContain("updateThemeMode('special')")
  expect(menuSource).toContain("updateThemeStyle('slate-light')")
  expect(menuSource).toContain("updateThemeMode('dark')")
  expect(menuSource).toContain("updateThemeStyle('default')")
})

test('未登录账户弹窗同样提供主题快捷切换', () => {
  expect(menuSource).toContain('<ThemeQuickSwitch />')
  expect(menuSource.match(/<ThemeQuickSwitch \/>/g)?.length).toBeGreaterThanOrEqual(2)
})

test('未登录触发器使用账户中心语义而不是重复登录动作', () => {
  expect(guestMenuSource).toContain('账户与设置')
  expect(guestMenuSource).not.toContain('<span className="flex-1 truncate text-left text-sm">\n              登录 OA 账号\n            </span>')
})

test('未登录弹窗只保留一个登录主动作', () => {
  expect(guestMenuSource.match(/登录 OA 账号/g)?.length).toBe(1)
  expect(guestMenuSource).toContain('onLogin()')
  expect(guestMenuSource).not.toContain('label="登录 OA 账号"')
})

test('未登录登录主按钮打开登录弹窗前关闭账户菜单', () => {
  expect(guestMenuSource).toContain('const [open, setOpen] = React.useState(false)')
  expect(guestMenuSource).toContain('<DropdownMenu open={open} onOpenChange={setOpen}>')
  expect(guestMenuSource).toContain('setOpen(false)')
  expect(guestMenuSource).toContain('onClick={handleLogin')
})

test('未登录登录主按钮使用主题主色而不是硬编码前景色', () => {
  expect(guestMenuSource).toContain('bg-primary')
  expect(guestMenuSource).toContain('text-primary-foreground')
  expect(guestMenuSource).not.toContain('bg-foreground px-4 py-3')
  expect(guestMenuSource).not.toContain('text-background')
})

test('账户弹窗深色模式有清晰边界和独立浮层背景', () => {
  expect(menuSource).toContain('ACCOUNT_MENU_CONTENT_CLASS')
  expect(menuSource).toContain('border-border/70')
  expect(menuSource).toContain('dark:border-white/10')
  expect(menuSource).toContain('dark:bg-dialog/95')
  expect(menuSource).toContain('dark:ring-white/10')
  expect(menuSource).not.toContain('rounded-[22px] border-0 bg-popover/95')
})

test('展开侧栏底部不再渲染账户菜单外的独立设置按钮', () => {
  expect(expandedFooterSource).not.toContain('<Settings size={16} />')
  expect(expandedFooterSource).not.toContain('TooltipContent side="top">设置</TooltipContent>')
})

test('外观设置不再展示应用图标配置区', () => {
  expect(appearanceSettingsSource).not.toContain('title="应用图标"')
  expect(appearanceSettingsSource).not.toContain('AppIconPicker')
  expect(appearanceSettingsSource).not.toContain('ICON_VARIANTS')
})
