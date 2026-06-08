/**
 * 自动更新核心模块
 *
 * WorkMate Server 升级链路：
 *   检测新版本 → 自动下载 → 校验 sha256/fileSize → 弹窗提示安装
 */

import { BrowserWindow, app } from 'electron'
import type { UpdateStatus } from './updater-types'
import { UPDATER_IPC_CHANNELS } from './updater-types'
import { checkForWorkmateUpgrade } from './workmate-api'
import { downloadInstaller } from './workmate-downloader'
import { verifyInstaller, launchInstaller } from './workmate-installer'
import {
  loadManifest, saveManifest, deleteManifest, deleteInstaller, getInstallerPath,
} from './workmate-manifest'
import { isValidVersionDirection } from './workmate-version'
import { getToken } from '../../../auth'
import { reportUpgradeCheckEvent } from '../observability-service'

// ===== 状态管理 =====

/** 当前更新状态 */
let currentStatus: UpdateStatus = { status: 'idle' }

/** 主窗口引用 */
let win: BrowserWindow | null = null

/** 随机检测 timer */
let checkTimer: ReturnType<typeof setTimeout> | null = null

/** 并发检查锁 */
let checking = false

/** 当前升级信息（内部持有，非全部推送给渲染端） */
let upgradeInfo: {
  downloadUrl?: string
  sha256?: string
  fileSize?: number
  fileName?: string
  packageType?: string
  latestVersion?: string
  releaseType?: 'UPGRADE' | 'ROLLBACK'
} = {}

function setStatus(status: UpdateStatus): void {
  currentStatus = status
  win?.webContents?.send(UPDATER_IPC_CHANNELS.ON_STATUS_CHANGED, status)
}

// ===== 公共 API =====

/** 获取当前更新状态 */
export function getUpdateStatus(): UpdateStatus {
  return currentStatus
}

/** 手动触发检查更新 */
export async function checkForUpdates(manual = false): Promise<void> {
  // 并发保护
  if (checking) {
    console.log('[更新] 跳过：已在检查中')
    return
  }

  // 已下载完成，跳过
  if (currentStatus.status === 'downloaded') {
    console.log('[更新] 跳过：已下载完成，等待安装')
    return
  }

  checking = true

  try {
    setStatus({ status: 'checking' })

    const platform = process.platform  // 'win32' | 'darwin' | 'linux'
    const arch = process.arch           // 'x64' | 'arm64'
    const currentVersion = app.getVersion()

    const result = await checkForWorkmateUpgrade(currentVersion, platform, arch)

    // 仅手动检查时上报升级检测事件
    if (manual) {
      try {
        reportUpgradeCheckEvent('success')
      } catch { /* 上报失败不影响主流程 */ }
    }

    if (!result.hasUpdate) {
      if (result.hint) {
        setStatus({ status: 'not-available', hint: result.hint })
      } else if (manual) {
        setStatus({ status: 'not-available' })
      } else {
        setStatus({ status: 'idle' })
      }
      return
    }

    // 保存内部信息
    upgradeInfo = {
      downloadUrl: result.downloadUrl,
      sha256: result.sha256,
      fileSize: result.fileSize,
      fileName: result.fileName,
      packageType: result.packageType,
      latestVersion: result.latestVersion,
      releaseType: result.releaseType,
    }

    setStatus({
      status: 'available',
      version: result.latestVersion!,
      releaseNotes: result.releaseNotes,
      forceUpdate: result.forceUpdate,
      releaseType: result.releaseType,
      hint: undefined,
    })

    // 自动进入下载
    await doDownload()
  } catch (err) {
    console.error('[更新] 检测失败:', err)

    // 仅手动检查时上报升级检测失败事件
    if (manual) {
      try {
        reportUpgradeCheckEvent('failure', err instanceof Error ? err : new Error(String(err)))
      } catch { /* 上报失败不影响主流程 */ }
    }

    if (manual) {
      setStatus({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    } else {
      // 周期/自动检测失败不展示错误，静默恢复 idle
      setStatus({ status: 'idle' })
    }
  } finally {
    checking = false
    scheduleNextCheck()
  }
}

/** 退出并安装已下载的更新 */
export async function quitAndInstall(): Promise<void> {
  try {
    if (!upgradeInfo.fileName || !upgradeInfo.latestVersion || !upgradeInfo.releaseType) {
      setStatus({ status: 'error', error: '安装信息不完整' })
      return
    }

    // 安装前校验
    const verifyResult = verifyInstaller({
      fileName: upgradeInfo.fileName,
      latestVersion: upgradeInfo.latestVersion,
      releaseType: upgradeInfo.releaseType,
      expectedSha256: upgradeInfo.sha256,
      expectedFileSize: upgradeInfo.fileSize,
      currentVersion: app.getVersion(),
    })

    if (!verifyResult.ok) {
      setStatus({ status: 'error', error: verifyResult.error! })
      deleteInstaller(upgradeInfo.fileName)
      deleteManifest()
      return
    }

    // 启动安装器
    const launched = await launchInstaller(verifyResult.installerPath)
    if (!launched) {
      setStatus({ status: 'error', error: '启动安装器失败' })
      return
    }

    // 移除窗口 close 拦截，退出应用
    for (const w of BrowserWindow.getAllWindows()) {
      w.removeAllListeners('close')
    }
    app.quit()
  } catch (err) {
    setStatus({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** 清理资源 */
export function cleanupUpdater(): void {
  if (checkTimer) {
    clearTimeout(checkTimer)
    checkTimer = null
  }
}

// ===== 初始化 =====

/**
 * 初始化自动更新
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  win = mainWindow

  console.log('[更新] WorkMate 升级检测初始化')

  // 1. 恢复 manifest（上次下载未安装的包）
  restoreManifest()

  // 2. 启动随机首检
  const firstDelay = randomInRange(10_000, 3_600_000)  // 10秒~60分钟
  console.log('[更新] 首检延迟 %d 秒', Math.round(firstDelay / 1000))
  checkTimer = setTimeout(() => {
    checkForUpdates().catch((err) => console.error('[更新] 首次检查失败:', err))
  }, firstDelay)

  // 窗口关闭时清理
  mainWindow.on('closed', () => {
    cleanupUpdater()
    win = null
  })
}

/**
 * 登录成功后 10 秒触发一次检查。
 * 由 auth/ipc-handlers.ts 调用。
 */
export function onLoginSuccess(): void {
  console.log('[更新] 登录成功，10秒后触发检查')
  setTimeout(() => {
    checkForUpdates().catch((err) => console.error('[更新] 登录后检查失败:', err))
  }, 10_000)
}

// ===== 内部方法 =====

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 递归调度下次周期检查（每次 6~8 小时重新随机） */
function scheduleNextCheck(): void {
  if (checkTimer) {
    clearTimeout(checkTimer)
    checkTimer = null
  }

  // 已下载完成时不再定时检查
  if (currentStatus.status === 'downloaded') return

  const delay = randomInRange(6 * 3600_000, 8 * 3600_000)
  console.log('[更新] 下次周期检测 %d 小时后', Math.round(delay / 3600_000))
  checkTimer = setTimeout(() => {
    // 检查是否有 token（已登出则跳过）
    if (!getToken()) {
      console.log('[更新] 无 token，跳过定时检查')
      scheduleNextCheck()
      return
    }
    checkForUpdates().catch((err) => console.error('[更新] 周期检查失败:', err))
  }, delay)
}

/** 恢复上次下载的 manifest */
function restoreManifest(): void {
  try {
    const manifest = loadManifest()
    if (!manifest) return

    // 版本方向仍有效
    if (manifest.releaseType && !isValidVersionDirection(
      app.getVersion(), manifest.version, manifest.releaseType,
    )) {
      console.log('[更新] manifest 版本方向失效，删除')
      deleteInstaller(manifest.fileName)
      deleteManifest()
      return
    }

    // 文件存在
    const path = getInstallerPath(manifest.fileName)
    const { existsSync } = require('node:fs')
    if (!existsSync(path)) {
      console.log('[更新] manifest 安装包不存在，删除')
      deleteManifest()
      return
    }

    // 恢复内部信息
    upgradeInfo = {
      fileName: manifest.fileName,
      sha256: manifest.sha256,
      fileSize: manifest.fileSize,
      packageType: manifest.packageType,
    }
    upgradeInfo.releaseType = manifest.releaseType
    upgradeInfo.latestVersion = manifest.version

    setStatus({
      status: 'downloaded',
      version: manifest.version,
      releaseNotes: manifest.releaseNotes,
      forceUpdate: manifest.forceUpdate,
      releaseType: manifest.releaseType,
      hint: manifest.hint,
    })
    console.log('[更新] manifest 恢复成功 version=%s', manifest.version)
  } catch (err) {
    console.error('[更新] manifest 恢复异常:', err)
    deleteManifest()
  }
}

/** 执行下载 */
async function doDownload(): Promise<void> {
  if (!upgradeInfo.downloadUrl || !upgradeInfo.fileName) {
    setStatus({ status: 'error', error: '下载信息不完整' })
    return
  }

  const current = currentStatus as { version?: string; releaseNotes?: string; forceUpdate?: boolean; releaseType?: 'UPGRADE' | 'ROLLBACK' }

  // 下载前校验 URL 安全边界
  try {
    const url = new URL(upgradeInfo.downloadUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('不支持的下载协议')
    }
    // 开发环境允许 http://localhost
    if (url.protocol === 'http:' && !url.hostname.startsWith('127.') && url.hostname !== 'localhost') {
      console.warn('[更新] 生产环境应使用 HTTPS 下载')
    }
  } catch (err) {
    setStatus({ status: 'error', error: `下载地址无效: ${(err as Error).message}` })
    return
  }

  try {
    // 第 1 次尝试
    await downloadAndSave(current)
  } catch (err) {
    console.error('[更新] 第 1 次下载失败:', err)
    // 5 秒后重试 1 次
    await new Promise((resolve) => setTimeout(resolve, 5000))
    try {
      await downloadAndSave(current)
    } catch (err2) {
      console.error('[更新] 第 2 次下载也失败:', err2)
      setStatus({ status: 'error', error: String(err2) })
    }
  }
}

async function downloadAndSave(current: {
  version?: string; releaseNotes?: string; forceUpdate?: boolean; releaseType?: 'UPGRADE' | 'ROLLBACK'
}): Promise<void> {
  const result = await downloadInstaller(
    upgradeInfo.downloadUrl!,
    upgradeInfo.fileName!,
    upgradeInfo.sha256,
    upgradeInfo.fileSize,
    {
      onProgress: (percent, transferred, total, bytesPerSecond) => {
        setStatus({
          status: 'downloading',
          version: current.version || '',
          releaseNotes: current.releaseNotes,
          progress: { percent, transferred, total, bytesPerSecond },
          forceUpdate: current.forceUpdate,
          releaseType: current.releaseType,
        })
      },
    },
  )

  // 保存 manifest
  saveManifest({
    version: current.version || '',
    releaseType: current.releaseType || 'UPGRADE',
    forceUpdate: current.forceUpdate || false,
    releaseNotes: current.releaseNotes,
    downloadedAt: Date.now(),
    sha256: result.sha256,
    fileSize: result.fileSize,
    fileName: upgradeInfo.fileName!,
    packageType: upgradeInfo.packageType,
  })

  setStatus({
    status: 'downloaded',
    version: current.version || '',
    releaseNotes: current.releaseNotes,
    forceUpdate: current.forceUpdate,
    releaseType: current.releaseType,
  })
}
