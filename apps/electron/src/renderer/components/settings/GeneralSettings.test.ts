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
