import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const source = await Bun.file(join(import.meta.dir, 'SystemLogSettings.tsx')).text()
const settingsPanelSource = await Bun.file(join(import.meta.dir, 'SettingsPanel.tsx')).text()
const preloadSource = await Bun.file(join(import.meta.dir, '..', '..', '..', 'preload', 'index.ts')).text()
const mainIpcSource = await Bun.file(join(import.meta.dir, '..', '..', '..', 'main', 'ipc.ts')).text()

describe('系统日志设置页', () => {
  test('通过安全 IPC 读取 main.log 和 renderer.log', () => {
    expect(source).toContain("type ActiveLogFile = 'main' | 'renderer'")
    expect(source).toContain('window.electronAPI.readSystemLog')
    expect(source).toContain("file: activeFile")
    expect(source).toContain('window.electronAPI.openSystemLogDir')
    expect(preloadSource).toContain('readSystemLog: (input: SystemLogReadInput)')
    expect(mainIpcSource).toContain('SYSTEM_LOG_IPC_CHANNELS.READ')
    expect(mainIpcSource).toContain("app.getPath('logs')")
  })

  test('页面提供搜索、刷新和滚动到底部能力', () => {
    expect(source).toContain('searchQuery')
    expect(source).toContain('handleRefresh')
    expect(source).toContain('scrollToTop')
    expect(source).toContain('匹配')
    expect(source).toContain('最近')
  })

  test('界面使用进程名称而不是日志文件名作为切换入口', () => {
    expect(source).toContain("label: '主进程'")
    expect(source).toContain("label: '页面进程'")
    expect(source).not.toContain("{activeMeta.label}</Badge>")
    expect(source).not.toContain('{logResult.path}')
  })

  test('支持日志级别过滤和时间倒序展示', () => {
    expect(source).toContain("type LogLevelFilter = 'all' | 'INFO' | 'WARN' | 'ERROR'")
    expect(source).toContain('LOG_LEVEL_OPTIONS')
    expect(source).toContain('activeLevel')
    expect(source).toContain('getVisibleLogContent')
    expect(source).toContain('reverseLogLines')
  })

  test('日志阅读区不使用黑底终端样式', () => {
    expect(source).not.toContain('bg-zinc-950')
    expect(source).not.toContain('text-zinc-100')
  })

  test('设置页渲染 system-log tab', () => {
    expect(settingsPanelSource).toContain('SystemLogSettings')
    expect(settingsPanelSource).toContain('case "system-log"')
  })
})
