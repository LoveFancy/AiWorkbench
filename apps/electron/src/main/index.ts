/**
 * 启动耗时追踪：记录从进程启动（双击 EXE）到各阶段的耗时。
 * 使用 Date.now() 而非 performance.now()，因为前者在模块顶层立即可用。
 */
const STARTUP_TIME = Date.now()
function elapsed(label: string): void {
  console.log(`[启动耗时] +${((Date.now() - STARTUP_TIME) / 1000).toFixed(2)}s | ${label}`)
}

import { app, BrowserWindow, dialog, Menu, nativeTheme, protocol, screen, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

elapsed('main 模块顶层开始执行')

// userData 目录必须在任何 safeStorage 调用前固定。
// safeStorage 的密钥材料依赖 userData/Local State；应用展示名改为 WorkMate 后，
// 仍沿用旧目录名，避免老版本 HtAiWorkBench 保存的 API Key 无法解密。
const SAFE_STORAGE_USER_DATA_NAME = 'HtAiWorkBench'

if (!app.isPackaged) {
  // Dev 与正式版使用独立的 userData 目录，避免共享 Chromium SingletonLock 导致 dev 启动被静默退出
  app.setPath('userData', join(app.getPath('appData'), '@proma/electron-dev'))
} else {
  app.setPath('userData', join(app.getPath('appData'), SAFE_STORAGE_USER_DATA_NAME))
}

app.setName('WorkMate')

elapsed('userData 路径设置完成，安装文件日志')
installFileLogger(app.getPath('logs'))

// 单实例锁：防止重复启动同一个版本（dev/prod 因 userData 已隔离，互不影响）
//
// 失败的常见原因：用户升级新版本时旧版进程仍在后台运行（macOS 关闭窗口 = hide
// 不退出）。原先此处直接 process.exit(0)，没有任何用户可见反馈——如果旧进程
// 卡在启动期，second-instance 也唤不起窗口，用户表现就是"双击应用没反应"。
// 改为：留下 stderr 排查线索后正常退出，让 Electron 触发已存在实例的
// second-instance 事件，由主实例负责显示窗口。
elapsed('单实例锁检查开始')
if (!app.requestSingleInstanceLock()) {
  const killHint =
    process.platform === 'win32'
      ? '请在任务管理器结束 WorkMate.exe（旧版可能名为 Proma.exe / HtAiWorkBench.exe），或执行 `taskkill /F /IM WorkMate.exe` 后重试。'
      : '请运行 `killall WorkMate`（旧版可能是 `killall Proma`）后重试。'
  console.warn(
    '[启动] 已有 WorkMate 进程持有单实例锁，本次启动将退出（已通知主实例显示窗口）。\n' +
      `  如果窗口仍未出现，可能旧进程已卡死。${killHint}`,
  )
  app.quit()
} else {
  // 主流程：正常启动（单实例锁已获取）
  elapsed('单实例锁已获取，注册协议和事件监听')
  registerProtocolsAndHandlers()
  elapsed('协议和事件监听注册完成')
}

function registerProtocolsAndHandlers(): void {
  // 注册自定义协议方案为"特权"（必须在 app ready 之前）
  // 用于内联预览本地文件（renderer 用 iframe 加载 proma-file:// 资源）
  protocol.registerSchemesAsPrivileged([
    { scheme: 'proma-file', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ])

  // Windows: 禁用 LCD 次像素抗锯齿（ClearType），改用灰度 AA。
  // ClearType 是为浅色背景+深色文字设计的，在深色代码块背景下会产生彩色边缘，导致文字模糊。
  if (process.platform === 'win32') {
    app.commandLine.appendSwitch('disable-lcd-text')
  }

  // macOS 文件关联：在 app ready 之前注册 open-file 事件
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    handleMigrationFileOpen(filePath)
  })

  // Windows 文件关联：当用户双击文件时，新实例的参数会通过 second-instance 传给已有实例
  app.on('second-instance', (_event, argv) => {
    showAndFocusMainWindow()
    const fileArg = argv.find((arg) => arg.endsWith('.proma-backup') || arg.endsWith('.proma-share'))
    if (fileArg) {
      handleMigrationFileOpen(fileArg)
    }
  })
}



import { getSettings, updateSettings } from './lib/settings-service'
import { handlePromaFileRequest } from './lib/local-file-protocol'
import { attachRendererLogCapture, flushFileLogger, installFileLogger } from './lib/file-logger'

// 处理 EPIPE 错误：当 stdout/stderr 管道被关闭时（如 electronmon 重启），忽略写入错误
// 这在开发环境热重载时经常发生，不影响应用功能
process.stdout?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return
  throw err
})
process.stderr?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return
  throw err
})

// 清理本地环境中的 ANTHROPIC_* 变量，防止干扰应用的认证流程
// Electron 桌面应用通过渠道系统管理 API Key，不应受终端环境变量影响
// 注意：此操作必须在 initializeRuntime()（loadShellEnv）之前执行
for (const key of Object.keys(process.env)) {
  if (key.startsWith('ANTHROPIC_')) {
    delete process.env[key]
  }
}

import { createApplicationMenu } from './menu'
import { registerIpcHandlers } from './ipc'
import { createTray, destroyTray, getTray } from './tray'
import { initializeRuntime, loadRuntimeCacheSync, getRuntimeStatus } from './lib/runtime-init'
import { IPC_CHANNELS } from '@proma/shared'
import { getConfigDirPath, seedDefaultPlugins, seedDefaultSkills, seedDefaultConnectors } from './lib/config-paths'
import { upgradeDefaultSkillsInWorkspaces, syncDefaultConnectorsToAllWorkspaces } from './lib/agent-workspace-manager'
import { stopAllAgents, killOrphanedClaudeSubprocesses } from './lib/agent-service'
import { stopAllGenerations } from './lib/chat-service'
import { startLocalApiServer, stopLocalApiServer } from './lib/local-api-service'
import { initAutoUpdater, cleanupUpdater } from './lib/updater/auto-updater'
import { startWorkspaceWatcher, stopWorkspaceWatcher } from './lib/workspace-watcher'
import { registerAuthIpcHandlers } from '../auth'
import { registerLogUploadIpc } from './lib/log-upload-ipc'
import './lib/issue-report'
import { loadCacheFromDisk, initModelRefresh } from './lib/platform-models-service'
import { registerPlatformModelsIpcHandlers } from './lib/platform-models-ipc'
import { startChatToolsWatcher, stopChatToolsWatcher } from './lib/chat-tools-watcher'
import { getIsQuitting, setQuitting } from './lib/app-lifecycle'
import {
  registerBridge,
  startAllBridges,
  startBridgeSelfHealing,
  stopAllBridges,
  stopBridgeSelfHealing,
} from './lib/bridge-registry'
import { startScheduler, stopScheduler } from './lib/automation-scheduler'
import { feishuBridgeManager } from './lib/feishu-bridge-manager'
import { getFeishuMultiBotConfig } from './lib/feishu-config'
import { stopFeishuSyncSleepBlocker, syncFeishuSyncSleepBlocker } from './lib/feishu-sleep-blocker'
import { dingtalkBridgeManager } from './lib/dingtalk-bridge-manager'
import { initWorkmateServices, shutdownWorkmateServices } from './lib/workmate-init'
import { getDingTalkMultiBotConfig } from './lib/dingtalk-config'
import { wechatBridge } from './lib/wechat-bridge'
import { getWeChatConfig } from './lib/wechat-config'
import { scheduleAfterFirstWindowLoad } from './lib/startup-bridge-scheduler'
import { createQuickTaskWindow, toggleQuickTaskWindow, destroyQuickTaskWindow } from './lib/quick-task-window'
import {
  createVoiceDictationWindow,
  toggleVoiceDictationWindow,
  destroyVoiceDictationWindow,
  shouldSuppressVoiceDictationActivate,
} from './lib/voice-dictation-window'
import { registerGlobalShortcut, unregisterAllGlobalShortcuts } from './lib/global-shortcut-service'
import { setPromaVersion } from '@proma/core'
import { TRAY_IPC_CHANNELS } from '../types'

const MIGRATION_IPC_OPEN = 'migration:open-import-file'
let isWorkmateShutdownComplete = false

/** 检查文件路径是否为迁移文件，如果是则通知渲染进程打开导入流程 */
function handleMigrationFileOpen(filePath: string): void {
  if (filePath.endsWith('.proma-backup') || filePath.endsWith('.proma-share')) {
    sendToMainWindow(MIGRATION_IPC_OPEN, { filePath })
  }
}

// ===== Bridge 注册（新增 Bridge 只需在此添加一个 registerBridge 调用） =====

registerBridge({
  name: '飞书 BridgeManager',
  shouldAutoStart: () => {
    const config = getFeishuMultiBotConfig()
    return config.bots.some((b) => b.enabled && b.appId && b.appSecret)
  },
  needsRecovery: () => {
    const config = getFeishuMultiBotConfig()
    const states = feishuBridgeManager.getStates()
    return config.bots.some((bot) => (
      bot.enabled &&
      !!bot.appId &&
      !!bot.appSecret &&
      states.bots[bot.id]?.status === 'error'
    ))
  },
  start: () => feishuBridgeManager.startAll(),
  stop: () => feishuBridgeManager.stopAll(),
  recover: () => recoverEnabledFeishuBots(),
})

registerBridge({
  name: '钉钉 BridgeManager',
  shouldAutoStart: () => {
    const config = getDingTalkMultiBotConfig()
    return config.bots.some((b) => b.enabled && b.clientId && b.clientSecret)
  },
  needsRecovery: () => {
    const config = getDingTalkMultiBotConfig()
    const states = dingtalkBridgeManager.getStates()
    return config.bots.some((bot) => (
      bot.enabled &&
      !!bot.clientId &&
      !!bot.clientSecret &&
      states.bots[bot.id]?.status === 'error'
    ))
  },
  start: () => dingtalkBridgeManager.startAll(),
  stop: () => dingtalkBridgeManager.stopAll(),
  recover: () => recoverEnabledDingTalkBots(),
})

registerBridge({
  name: '微信 Bridge',
  shouldAutoStart: () => {
    const config = getWeChatConfig()
    return !!(config.enabled && config.credentials)
  },
  needsRecovery: () => wechatBridge.getStatus().status === 'error',
  start: () => wechatBridge.start(),
  stop: () => wechatBridge.stop(),
})

async function recoverEnabledFeishuBots(): Promise<void> {
  const config = getFeishuMultiBotConfig()
  let failedCount = 0
  for (const bot of config.bots) {
    if (!bot.enabled || !bot.appId || !bot.appSecret) continue
    try {
      await feishuBridgeManager.restartBot(bot.id)
    } catch (error) {
      failedCount++
      console.error(`[飞书 BridgeManager] Bot "${bot.name}" 自愈恢复失败:`, error)
    }
  }
  if (failedCount > 0) {
    throw new Error(`${failedCount} 个飞书 Bot 自愈恢复失败`)
  }
}

async function recoverEnabledDingTalkBots(): Promise<void> {
  const config = getDingTalkMultiBotConfig()
  let failedCount = 0
  for (const bot of config.bots) {
    if (!bot.enabled || !bot.clientId || !bot.clientSecret) continue
    try {
      await dingtalkBridgeManager.restartBot(bot.id)
    } catch (error) {
      failedCount++
      console.error(`[钉钉 BridgeManager] Bot "${bot.name}" 自愈恢复失败:`, error)
    }
  }
  if (failedCount > 0) {
    throw new Error(`${failedCount} 个钉钉 Bot 自愈恢复失败`)
  }
}

let mainWindow: BrowserWindow | null = null

/** 获取主窗口实例（供其他模块使用） */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function installWindowsZoomInFallback(win: BrowserWindow): void {
  if (process.platform !== 'win32') return

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return

    // Windows 下主键盘的 Ctrl++ 常会以 Ctrl+= 上报；小键盘加号也需要兜底。
    const key = input.key.toLowerCase()
    if (!['=', '+', 'numadd', 'add'].includes(key)) return

    event.preventDefault()
    const currentZoomLevel = win.webContents.getZoomLevel()
    win.webContents.setZoomLevel(Math.min(currentZoomLevel + 0.5, 9))
  })
}

/**
 * 检查窗口是否在可用显示器范围内
 * 处理外接显示器断开后窗口位于不可见区域的情况
 */
function ensureWindowOnScreen(win: BrowserWindow): void {
  const bounds = win.getBounds()
  const displays = screen.getAllDisplays()
  // 检查窗口中心点是否在任一显示器范围内
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const isOnScreen = displays.some((display) => {
    const { x, y, width, height } = display.workArea
    return centerX >= x && centerX <= x + width && centerY >= y && centerY <= y + height
  })
  if (!isOnScreen) {
    // 窗口不在任何屏幕内，移动到主显示器居中位置
    const primary = screen.getPrimaryDisplay()
    const { x, y, width, height } = primary.workArea
    win.setBounds({
      x: x + Math.round((width - bounds.width) / 2),
      y: y + Math.round((height - bounds.height) / 2),
      width: bounds.width,
      height: bounds.height,
    })
    console.log('[窗口] 窗口已重新定位到主显示器')
  }
}

/** 显示并聚焦主窗口，确保窗口在可见区域；若窗口已销毁则重新创建 */
function showAndFocusMainWindow(): void {
  if (process.platform === 'darwin') {
    if (app.dock) app.dock.show()
    app.show()
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  ensureWindowOnScreen(mainWindow)
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()

  // Windows: show()/focus() 不保证能从其他前台应用抢回焦点（second-instance / 托盘唤起常遇到）。
  // 用 alwaysOnTop 抖动一次强制置顶到前台，再立即还原，避免长期置顶遮挡其他窗口。
  if (process.platform === 'win32') {
    mainWindow.setAlwaysOnTop(true)
    mainWindow.setAlwaysOnTop(false)
    mainWindow.focus()
  }
}

/**
 * Get the appropriate app icon path for the current platform
 */
function getIconPath(): string {
  // resources 在 build:resources 阶段被复制到 dist/ 下，与 main.cjs 同级
  const resourcesDir = join(__dirname, 'resources')

  if (process.platform === 'darwin') {
    return join(resourcesDir, 'icon.icns')
  } else if (process.platform === 'win32') {
    return join(resourcesDir, 'icon.ico')
  } else {
    return join(resourcesDir, 'icon.png')
  }
}

function saveMainWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const isMaximized = mainWindow.isMaximized()
  // 最大化时用恢复尺寸（unmaximize 后的尺寸），避免记录最大化的全屏 bounds
  const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
  updateSettings({
    mainWindowState: {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized,
    },
  })
}

function createWindow(): void {
  const iconPath = getIconPath()
  const iconExists = existsSync(iconPath)

  if (!iconExists) {
    console.warn('App icon not found at:', iconPath)
  }

  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'

  const titleBarOptions = isMac
    ? {
        titleBarStyle: 'hiddenInset' as const,
        trafficLightPosition: { x: 18, y: 18 },
        vibrancy: 'under-window' as const,
        visualEffectState: 'followWindow' as const,
      }
    : isWindows
      ? { titleBarStyle: 'hidden' as const }
      : {}

  const savedState = getSettings().mainWindowState
  const initialBounds = savedState
    ? { width: savedState.width, height: savedState.height, x: savedState.x, y: savedState.y }
    : { width: 1400, height: 900 }

  mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: 800,
    minHeight: 600,
    icon: iconExists ? iconPath : undefined,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...titleBarOptions,
  })
  elapsed('createWindow: BrowserWindow 实例创建完成')
  installWindowsZoomInFallback(mainWindow)
  attachRendererLogCapture(mainWindow, app.getPath('logs'))

  // Load the renderer
  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'))
  }
  elapsed('createWindow: 页面加载指令已发出（loadURL/loadFile）')

  // 窗口就绪后，按保存的状态决定是否最大化
  mainWindow.once('ready-to-show', () => {
    elapsed('createWindow: ready-to-show 事件触发，窗口即将显示')
    if (savedState?.isMaximized ?? true) {
      mainWindow?.maximize()
    }
    if (process.platform === 'darwin' && app.dock) {
      app.dock.show()
    }
    mainWindow?.show()
    elapsed('createWindow: 窗口已显示（首屏可见）')

    // 首屏已呈现，启动后台重活（运行时检测等阻塞操作延后到此刻，避免卡住首帧）
    scheduleBackgroundInit()
  })

  // 持久化窗口大小和位置（防抖 500ms，避免频繁写入）
  let windowStateSaveTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleWindowStateSave = (): void => {
    if (windowStateSaveTimer) clearTimeout(windowStateSaveTimer)
    windowStateSaveTimer = setTimeout(() => {
      windowStateSaveTimer = null
      saveMainWindowState()
    }, 500)
  }
  mainWindow.on('resize', scheduleWindowStateSave)
  mainWindow.on('move', scheduleWindowStateSave)

  // 渲染进程加载里程碑
  mainWindow.webContents.on('dom-ready', () => {
    elapsed('renderer: dom-ready 事件（DOM 解析完成）')
  })
  mainWindow.webContents.on('did-finish-load', () => {
    elapsed('renderer: did-finish-load 事件（页面资源加载完成）')
  })

  // 拦截页面内导航，外部链接用系统浏览器打开，防止 Electron 窗口被覆盖
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // 允许开发模式下的 Vite HMR 热重载
    if (isDev && url.startsWith('http://127.0.0.1:')) return
    event.preventDefault()
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
  })

  // 拦截 window.open / target="_blank" 链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // macOS: 点击关闭按钮时隐藏窗口+应用，而不是退出
  // 同时隐藏应用（类似 Cmd+H），确保点击 Dock 图标时 macOS 能正确触发 activate 事件
  if (process.platform === 'darwin') {
    mainWindow.on('close', (event) => {
      if (!getIsQuitting()) {
        // 隐藏前先刷新挂起的窗口状态保存
        if (windowStateSaveTimer) {
          clearTimeout(windowStateSaveTimer)
          windowStateSaveTimer = null
        }
        saveMainWindowState()
        event.preventDefault()
        mainWindow?.hide()
        app.hide()
      }
    })
  }

  // Windows: 点击关闭按钮时隐藏窗口到托盘，而不是退出
  if (process.platform === 'win32') {
    mainWindow.on('close', (event) => {
      if (!getIsQuitting() && getTray()) {
        // 隐藏前先刷新挂起的窗口状态保存
        if (windowStateSaveTimer) {
          clearTimeout(windowStateSaveTimer)
          windowStateSaveTimer = null
        }
        saveMainWindowState()
        event.preventDefault()
        mainWindow?.hide()
      }
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function sendToMainWindow(channel: string, data?: unknown): void {
  showAndFocusMainWindow()

  const win = mainWindow
  if (!win || win.isDestroyed()) return

  const send = (): void => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

/**
 * 向主窗口安静发送消息：与 sendToMainWindow 不同，**不**显示/聚焦窗口。
 * 用于后台事件（如运行时检测完成）推送，避免每次都把窗口抢到前台。
 */
function sendToMainWindowQuiet(channel: string, data?: unknown): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) return

  const send = (): void => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

elapsed('模块加载完成，等待 app.whenReady()')
app.whenReady().then(() => {
  elapsed('app.whenReady() 回调触发，开始 bootstrap')
  return bootstrap()
}).then(() => {
  elapsed('bootstrap 完成，等待渲染进程加载（主进程空闲，无后台任务）')
}).catch(handleBootstrapFailure)

/**
 * 启动主流程。所有非关键步骤用 safeRun / safeAwait 隔离，
 * 单点失败不应阻止窗口和托盘的创建（用户至少要能看到界面）。
 */
// 看门狗：后台重活超过此时间未完成则打印告警（不阻断）
const BACKGROUND_INIT_WATCHDOG_MS = 20000
async function bootstrap(): Promise<void> {
  // 初始化 Proma 版本号（供 User-Agent 等全局标识使用）
  setPromaVersion(app.getVersion())
  console.log(`[启动] Proma v${app.getVersion()} ${app.isPackaged ? '' : '(dev)'}`)

  // 注册自定义协议 proma-file:// 用于内联预览本地文件。
  // 协议只接受主进程签发的 opaque token，不解析 renderer 提供的绝对路径。
  protocol.handle('proma-file', handlePromaFileRequest)
  elapsed('bootstrap: 版本号 & 协议注册完成')

  // ── 关键段：首屏可见前必须就绪的最小集合（保持轻量，不做阻塞式检测） ──

  // 同步默认 Skills 模板到 ~/.workmate/default-skills/
  safeRun('seedDefaultSkills', seedDefaultSkills)

  // 同步默认插件到 ~/.workmate/default-plugins/
  safeRun('seedDefaultPlugins', seedDefaultPlugins)

  // 同步默认连接器到 ~/.workmate/default-connectors/
  safeRun('seedDefaultConnectors', seedDefaultConnectors)

  // 工作区连接器同步和 Skills 升级已移至后台初始化（runBackgroundInit），
  // 避免其同步文件 I/O（cpSync/readFileSync/writeFileSync）阻塞首屏关键路径。
  elapsed('bootstrap: Skills/Plugins 初始化完成')

  // Create application menu
  const menu = createApplicationMenu()
  Menu.setApplicationMenu(menu)
  elapsed('bootstrap: 菜单创建完成')

  // IPC 处理器必须先于渲染层首个调用（auth.checkSession / getSettings）注册，否则首屏 IPC 会失败
  // Register IPC handlers
  registerIpcHandlers()
  registerLogUploadIpc()
  registerAuthIpcHandlers()
  registerPlatformModelsIpcHandlers()
  elapsed('bootstrap: IPC handlers 注册完成')

  // 应用菜单（同步、廉价）。保留在关键段，确保 macOS 首屏即可用 Cmd+C/V/Q 等标准快捷键
  safeRun('createApplicationMenu', () => Menu.setApplicationMenu(createApplicationMenu()))

  // 从磁盘加载模型缓存（同步快读）——必须在窗口创建前，避免渲染层请求 channels 时拿到空列表
  loadCacheFromDisk()
  initModelRefresh()

  // 预热运行时检测缓存：使后台真实检测完成前，getRuntimeStatus() 即可返回上次结果，
  // 避免 sdk-env / agent-orchestrator 在启动初期读到 null。后台会重测并覆盖。
  safeRun('loadRuntimeCacheSync', () => loadRuntimeCacheSync())
  elapsed('bootstrap: 模型缓存加载完成')

  // Set dock icon on macOS
  // 确保 Dock 图标可见（dev 模式下通过 spawn 启动时可能不会自动显示）
  // 如果用户有保存的图标偏好则使用，否则用默认图标
  if (process.platform === 'darwin' && app.dock) {
    await app.dock.show()
    const { resolveAppIconPath } = require('./ipc')
    const settings = getSettings()
    const variantId = settings.appIconVariant
    const dockIconPath = resolveAppIconPath(variantId ?? 'default')
    if (dockIconPath && existsSync(dockIconPath)) {
      app.dock.setIcon(dockIconPath)
    }
  }

  // Create main window (will be shown when ready)
  elapsed('bootstrap: 准备创建主窗口')
  createWindow()
  elapsed('bootstrap: 主窗口创建完成（页面加载中...）')

  // Create system tray icon
  createTray({
    showMainWindow: showAndFocusMainWindow,
    openAgentSession: (sessionId, title) => {
      sendToMainWindow(TRAY_IPC_CHANNELS.OPEN_AGENT_SESSION, { sessionId, title })
    },
    createChatSession: () => {
      sendToMainWindow(TRAY_IPC_CHANNELS.CREATE_SESSION, { mode: 'chat' })
    },
    createAgentSession: () => {
      sendToMainWindow(TRAY_IPC_CHANNELS.CREATE_SESSION, { mode: 'agent' })
    },
  })
  elapsed('bootstrap: 系统托盘创建完成')

  // 启动工作区文件监听（Agent MCP/Skills + 文件浏览器自动刷新）
  if (mainWindow) {
    safeRun('startWorkspaceWatcher', () => startWorkspaceWatcher(mainWindow!))
  }

  // 启动 Chat 工具配置文件监听（Agent 创建工具后自动通知渲染进程）
  safeRun('startChatToolsWatcher', startChatToolsWatcher)

  // 初始化自动更新
  if (mainWindow) {
    safeRun('initAutoUpdater', () => initAutoUpdater(mainWindow!))
  }

  // 预创建快速任务窗口已移至后台初始化（ready-to-show 之后），
  // 避免其 loadFile 与主窗口渲染进程并发从 asar 加载，在受管机上触发 AV 串行化。
  if (getSettings().voiceDictation?.enabled === true) {
    safeRun('createVoiceDictationWindow', createVoiceDictationWindow)
  }
  elapsed('bootstrap: 快捷窗口 & 更新器初始化完成')

  // 飞书实时同步开启时，默认阻止系统自动休眠，保证远程群内继续可用。
  safeRun('syncFeishuSyncSleepBlocker', () => syncFeishuSyncSleepBlocker(getSettings()))

  // 注册全局快捷键
  safeRun('registerGlobalShortcut:quick-task', () =>
    registerGlobalShortcut('quick-task', toggleQuickTaskWindow),
  )
  safeRun('registerGlobalShortcut:show-main-window', () =>
    registerGlobalShortcut('show-main-window', showAndFocusMainWindow),
  )
  safeRun('registerGlobalShortcut:voice-dictation', () =>
    registerGlobalShortcut('voice-dictation', () => {
      toggleVoiceDictationWindow({ targetIsProma: mainWindow?.isFocused() === true })
    }),
  )

  // 启动所有已注册的 Bridge（飞书/钉钉/微信等）
  // Windows 上飞书 SDK import/connect 曾与首屏加载竞争资源，导致 loadFile 到 preload 延迟约 90s。
  // 这里延后到主窗口首轮加载完成后启动，保证用户先看到界面。
  elapsed('bootstrap: 安排 Bridges 在首屏加载后启动')
  scheduleAfterFirstWindowLoad(mainWindow, (reason) => {
    elapsed(`bootstrap: ${reason}，准备启动 Bridges`)
    void safeAwait('startAllBridges', () => startAllBridges()).then(() => {
      safeRun('startBridgeSelfHealing', startBridgeSelfHealing)
      elapsed('bootstrap: Bridges 启动完成')
    })
  })

  // 启动本地 API 服务（默认关闭，仅在用户设置启用后启动）
  await safeAwait('startLocalApiServer', startLocalApiServer)

  // 启动定时任务调度器（恢复持久化的 active 任务）
  safeRun('startScheduler', startScheduler)

  elapsed('bootstrap: 核心初始化完成（Bridges 已按首屏加载调度）')

  app.on('activate', () => {
    if (shouldSuppressVoiceDictationActivate()) {
      return
    }

    // 直接检查 mainWindow 引用，避免 getAllWindows() 包含 DevTools 等其他窗口导致误判
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
    } else {
      // 窗口已存在但可能被隐藏（macOS 关闭按钮 = hide），重新显示
      showAndFocusMainWindow()
    }
  })

  // 后台初始化由 createWindow 的 ready-to-show 回调触发。
  // 兜底：极端情况下渲染进程被 AV/EDR 拦截，ready-to-show 永远不触发，
  // 120s 后强制启动后台初始化。正常情况 ~10s 内就会触发，不会走到这里。
  const BACKGROUND_INIT_FALLBACK_MS = 120_000
  setTimeout(() => {
    if (!backgroundInitStarted) {
      console.warn('[启动耗时] ⚠️ ready-to-show 超时未触发，走兜底强制启动后台初始化')
      scheduleBackgroundInit()
    }
  }, BACKGROUND_INIT_FALLBACK_MS)
}

/**
 * 调度后台重活：仅执行一次，由 createWindow 的 ready-to-show 回调触发。
 * 让出一帧给合成器，确保渲染层的 loading 画面已呈现，
 * 之后才开始 initializeRuntime——后者内部用 execSync 会阻塞主进程事件循环。
 */
let backgroundInitStarted = false
function scheduleBackgroundInit(): void {
  if (backgroundInitStarted) return
  backgroundInitStarted = true
  setTimeout(() => {
    void runBackgroundInit()
  }, 0)
}

/**
 * 后台初始化：运行时检测、默认资源同步、Bridge、定时任务等全部重活。
 * 与首屏解耦——窗口和托盘在 bootstrap 关键段已创建，这里失败/卡死都不影响窗口可见与唤起。
 */
async function runBackgroundInit(): Promise<void> {
  elapsed('background: 开始后台初始化')

  // 看门狗：后台初始化超时只告警、不阻断，便于定位卡死步骤（通常是运行时检测或 Bridge）
  const watchdog = setTimeout(() => {
    console.warn(
      `[启动] 后台初始化超过 ${BACKGROUND_INIT_WATCHDOG_MS / 1000}s 仍未完成，` +
        '可能卡在运行时检测（Node/Git）或 Bridge 启动。窗口已可用，相关功能将在完成后逐步生效。',
    )
  }, BACKGROUND_INIT_WATCHDOG_MS)

  try {
    // 初始化运行时环境（Shell 环境 + Node/Bun/Git 检测）。内部为同步检测，故必须延后到首屏之后
    await safeAwait('initializeRuntime', () => initializeRuntime())
    elapsed('background: initializeRuntime 完成')

    // 后台真实检测完成，安静推送最新运行时状态给渲染层（不抢焦点），刷新环境检测 UI
    safeRun('pushRuntimeStatus', () => {
      const status = getRuntimeStatus()
      if (status) sendToMainWindowQuiet(IPC_CHANNELS.RUNTIME_STATUS_UPDATED, status)
    })

    // 同步默认 Skills / 插件 / 连接器
    safeRun('seedDefaultSkills', seedDefaultSkills)
    seedDefaultPlugins()
    safeRun('seedDefaultConnectors', seedDefaultConnectors)
    safeRun('syncDefaultConnectorsToAllWorkspaces', syncDefaultConnectorsToAllWorkspaces)
    safeRun('upgradeDefaultSkillsInWorkspaces', upgradeDefaultSkillsInWorkspaces)
    elapsed('background: Skills/Plugins 初始化完成')

    // WorkMate 观测上报服务初始化（传入启动耗时用于 app_startup 上报）
    safeRun('initWorkmateServices', () => initWorkmateServices(Date.now() - STARTUP_TIME))

    // 启动工作区文件监听（Agent MCP/Skills + 文件浏览器自动刷新）
    if (mainWindow) {
      safeRun('startWorkspaceWatcher', () => startWorkspaceWatcher(mainWindow!))
    }

    // 启动 Chat 工具配置文件监听（Agent 创建工具后自动通知渲染进程）
    safeRun('startChatToolsWatcher', startChatToolsWatcher)

    // 初始化自动更新
    if (mainWindow) {
      safeRun('initAutoUpdater', () => initAutoUpdater(mainWindow!))
    }

    // 预创建快速任务窗口（隐藏状态，首次唤起秒开）
    safeRun('createQuickTaskWindow', createQuickTaskWindow)
    if (getSettings().voiceDictation?.enabled === true) {
      safeRun('createVoiceDictationWindow', createVoiceDictationWindow)
    }
    elapsed('background: 快捷窗口 & 更新器初始化完成')

    // 飞书实时同步开启时，默认阻止系统自动休眠，保证远程群内继续可用。
    safeRun('syncFeishuSyncSleepBlocker', () => syncFeishuSyncSleepBlocker(getSettings()))

    // 注册全局快捷键
    safeRun('registerGlobalShortcut:quick-task', () =>
      registerGlobalShortcut('quick-task', toggleQuickTaskWindow),
    )
    safeRun('registerGlobalShortcut:show-main-window', () =>
      registerGlobalShortcut('show-main-window', showAndFocusMainWindow),
    )
    safeRun('registerGlobalShortcut:voice-dictation', () =>
      registerGlobalShortcut('voice-dictation', () => {
        toggleVoiceDictationWindow({ targetIsProma: mainWindow?.isFocused() === true })
      }),
    )

    // 启动所有已注册的 Bridge（飞书/钉钉/微信等）
    elapsed('background: 准备启动 Bridges')
    await safeAwait('startAllBridges', () => startAllBridges())
    safeRun('startBridgeSelfHealing', startBridgeSelfHealing)
    elapsed('background: Bridges 启动完成')

    // 启动本地 API 服务（默认关闭，仅在用户设置启用后启动）
    await safeAwait('startLocalApiServer', startLocalApiServer)

    // 启动定时任务调度器（恢复持久化的 active 任务）
    safeRun('startScheduler', startScheduler)

    elapsed('background: 全部后台初始化完成')
  } finally {
    clearTimeout(watchdog)
  }
}

/** 同步启动钩子隔离：单点失败仅记录日志，不阻断启动链。 */
function safeRun(name: string, fn: () => void): void {
  try {
    fn()
  } catch (err) {
    console.error(`[启动] ${name} 失败（已隔离）:`, err)
  }
}

/** 异步启动钩子隔离：同 safeRun，但适用于返回 Promise 的钩子。 */
async function safeAwait(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`[启动] ${name} 失败（已隔离）:`, err)
  }
}

/**
 * whenReady 顶层兜底：理论上 bootstrap 内的 safeRun/safeAwait 已经把所有可预期
 * 异常隔离掉了，能走到这里说明出了 bootstrap 本身控制流的意外（极端情况），
 * 此时仍尝试创建一个降级窗口，让用户至少能看到界面、复制日志、提交反馈。
 */
function handleBootstrapFailure(err: unknown): void {
  console.error('[启动] bootstrap 致命错误，进入降级模式:', err)

  try {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
    let configDirPath = '~/.workmate（老用户可能是 ~/.proma）'
    try {
      configDirPath = getConfigDirPath()
    } catch {
      // 启动降级路径中不能因为数据目录解析失败而阻止错误弹窗。
    }
    const processKillHint =
      process.platform === 'win32'
        ? '在任务管理器结束 WorkMate.exe（旧版可能名为 Proma.exe / HtAiWorkBench.exe）后重试'
        : '终端运行 `killall WorkMate`（旧版可能是 `killall Proma`）后重试'
    dialog.showErrorBox(
      'WorkMate 启动遇到错误',
      `部分功能可能不可用：\n\n${message}\n\n` +
        `日志位置：${app.getPath('logs')}\n\n` +
        `常见原因与排查：\n` +
        `1. 旧版进程未退出（${processKillHint}）\n` +
        `2. 数据目录配置损坏（重命名 ${configDirPath} 后重启）\n` +
        `3. 系统 Keychain 无法解密保存的凭证（删除 ${configDirPath}/feishu.json 等后重新登录）\n\n` +
        `如需协助请到 GitHub Issues 反馈。`,
    )
  } catch {
    /* dialog 也失败，无能为力 */
  }

  try {
    registerIpcHandlers()
    createWindow()
  } catch (fallbackErr) {
    console.error('[启动] 降级窗口创建也失败:', fallbackErr)
  }
}

app.on('window-all-closed', () => {
  // 非 macOS：关闭所有窗口时退出应用
  // macOS：保持应用运行（可通过 tray 或 Dock 重新打开）
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  // WorkMate 观测上报：等待最后一批事件完成冲刷后再继续退出
  if (!isWorkmateShutdownComplete) {
    event.preventDefault()
    void shutdownWorkmateServices()
      .catch((error) => console.warn('[WorkMate] 观测上报关闭失败:', error))
      .then(() => flushFileLogger())
      .catch((error) => console.warn('[日志] 退出前刷新日志失败:', error))
      .finally(() => {
        isWorkmateShutdownComplete = true
        app.quit()
      })
    return
  }

  // 标记正在退出，让 close 事件不再阻止关闭
  setQuitting()

  // 中止所有活跃的 Agent 和 Chat 子进程
  stopAllAgents()
  stopAllGenerations()
  // 最后兜底：扫描并强杀所有孤儿 claude-agent-sdk 子进程（Issue #357）
  // 针对 pidMap 未覆盖、dispose 漏杀等极端场景，确保不遗留残留进程
  killOrphanedClaudeSubprocesses()
  // 清理更新器定时器
  cleanupUpdater()
  // 停止工作区文件监听
  stopWorkspaceWatcher()
  // 停止 Chat 工具配置文件监听
  stopChatToolsWatcher()
  // 停止本地 API 服务
  void stopLocalApiServer().catch((error) => console.warn('[本地 API] 停止服务失败:', error))
  // 停止所有 Bridge
  stopBridgeSelfHealing()
  stopAllBridges()
  // 停止定时任务调度器
  stopScheduler()
  // 释放飞书同步防休眠
  stopFeishuSyncSleepBlocker()
  // 注销全局快捷键
  unregisterAllGlobalShortcuts()
  // 销毁快速任务窗口
  destroyQuickTaskWindow()
  destroyVoiceDictationWindow()
  // Clean up system tray before quitting
  destroyTray()
})
