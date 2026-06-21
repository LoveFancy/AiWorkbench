import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const generalSettingsSource = await Bun.file(join(import.meta.dir, 'GeneralSettings.tsx')).text()
const preloadSource = await Bun.file(join(import.meta.dir, '..', '..', '..', 'preload', 'index.ts')).text()
const settingsTypesSource = await Bun.file(join(import.meta.dir, '..', '..', '..', 'types', 'settings.ts')).text()
const mainIpcSource = await Bun.file(join(import.meta.dir, '..', '..', '..', 'main', 'ipc.ts')).text()

describe('通用设置数据目录', () => {
  test('数据目录待生效时提供真正的应用重启入口', () => {
    expect(generalSettingsSource).toContain('handleRelaunchApp')
    expect(generalSettingsSource).toContain('configRootInfo?.requiresRestart')
    expect(generalSettingsSource).toContain('立即重启')
    expect(generalSettingsSource).toContain('window.electronAPI.relaunchApp()')
  })

  test('preload 和设置 IPC 暴露应用重启通道', () => {
    expect(settingsTypesSource).toContain("RELAUNCH_APP: 'settings:relaunch-app'")
    expect(preloadSource).toContain('relaunchApp: () => Promise<void>')
    expect(preloadSource).toContain('SETTINGS_IPC_CHANNELS.RELAUNCH_APP')
    expect(mainIpcSource).toContain('SETTINGS_IPC_CHANNELS.RELAUNCH_APP')
    expect(mainIpcSource).toContain('app.relaunch()')
    expect(mainIpcSource).toContain('app.exit(0)')
  })
})

describe('通用设置头像选择器', () => {
  test('Emoji 头像选择器提供固定滚动区域和滚轮兜底处理', () => {
    expect(generalSettingsSource).toContain('emojiPickerScrollRef')
    expect(generalSettingsSource).toContain('getEmojiPickerScrollElement')
    expect(generalSettingsSource).toContain("querySelector('em-emoji-picker')")
    expect(generalSettingsSource).toContain("shadowRoot?.querySelector('.scroll')")
    expect(generalSettingsSource).toContain('handleEmojiPickerWheel')
    expect(generalSettingsSource).toContain('onWheel={handleEmojiPickerWheel}')
    expect(generalSettingsSource).toContain('max-h-[420px] overflow-y-auto overscroll-contain')
  })
})

describe('通用设置用户档案登录态同步', () => {
  test('已登录时展示不可编辑工号，不落到默认用户名', () => {
    expect(generalSettingsSource).toContain('authStateAtom')
    expect(generalSettingsSource).toContain('profileDisplayName')
    expect(generalSettingsSource).toContain('authState.jobId?.trim()')
    expect(generalSettingsSource).toContain('const canEditProfileName = !authState.isLoggedIn')
    expect(generalSettingsSource).toContain('canEditProfileName && isEditingName')
    expect(generalSettingsSource).toContain('!canEditProfileName ? (')
    expect(generalSettingsSource).toContain('{profileDisplayName}')
    expect(generalSettingsSource).toContain('工号 {authState.jobId}')
  })
})

describe('通用设置快捷导航锚点', () => {
  test('跳转到区块时预留 sticky 导航高度，避免标题被遮挡', () => {
    expect(generalSettingsSource).toContain('GENERAL_SETTINGS_ANCHOR_CLASS')
    expect(generalSettingsSource).toContain('scroll-mt-14')
  })
})
