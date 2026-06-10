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

/** 启动时从 manifest 恢复的待验证信息（服务端验证通过前不推送 downloaded 状态） */
let pendingManifestInfo: {
  version: string
  releaseNotes?: string
  forceUpdate: boolean
  releaseType: 'UPGRADE' | 'ROLLBACK'
  hint?: string
} | null = null

function setStatus(status: UpdateStatus): void {
  currentStatus = status
  console.log('[更新] setStatus: %s (win=%s)', status.status, win ? '有' : '无')
  win?.webContents?.send(UPDATER_IPC_CHANNELS.ON_STATUS_CHANGED, status)
}

// ===== 公共 API =====

/** 获取当前更新状态 */
export function getUpdateStatus(): UpdateStatus {
  return currentStatus
}

/** 手动触发检查更新 */
export async function checkForUpdates(manual = false, silent = false): Promise<void> {
  // 并发保护
  if (checking) {
    console.log('[更新] 跳过：已在检查中')
    return
  }

  // 本地有安装包待验证（downloaded 状态 或 启动时 manifest 恢复的待验证包）
  const hasLocalInstaller = currentStatus.status === 'downloaded' || pendingManifestInfo !== null
  if (hasLocalInstaller) {
    console.log('[更新] 本地有安装包，向服务端验证版本是否仍有效 (mode=%s)',
      pendingManifestInfo ? 'startup-pending' : 'downloaded')
  }

  checking = true

  try {
    setStatus({ status: 'checking' })

    const platform = process.platform
    const arch = process.arch
    const currentVersion = app.getVersion()

    const result = await checkForWorkmateUpgrade(currentVersion, platform, arch)

    // 仅手动检查时上报升级检测事件
    if (manual) {
      try {
        reportUpgradeCheckEvent('success')
      } catch { /* 上报失败不影响主流程 */ }
    }

    // ---- 本地有安装包时的特殊处理：服务端可能取消/改变了此版本 ----
    if (hasLocalInstaller) {
      // 本地保存的版本号（downloaded 状态取 upgradeInfo，pending 取 pendingManifestInfo）
      const localVersion = pendingManifestInfo?.version ?? upgradeInfo.latestVersion

      if (!result.hasUpdate || result.latestVersion !== localVersion) {
        // 版本被暂停/撤回/变更 → 清理本地安装包和 manifest
        console.log('[更新] 服务端已暂停/变更此版本 (hasUpdate=%s, local=%s, server=%s)，清理本地安装包',
          result.hasUpdate, localVersion, result.latestVersion)
        if (upgradeInfo.fileName) {
          deleteInstaller(upgradeInfo.fileName)
        }
        deleteManifest()
        upgradeInfo = {}
        pendingManifestInfo = null

        if (!result.hasUpdate) {
          if (result.hint) {
            setStatus({ status: 'not-available', hint: result.hint })
          } else if (manual) {
            setStatus({ status: 'not-available' })
          } else {
            setStatus({ status: 'idle' })
          }
        } else {
          // 版本变了，继续往下走正常更新流程
          console.log('[更新] 版本变更，进入正常更新流程')
        }
        // 如果 result.hasUpdate 但版本已变 → 继续执行下面的更新逻辑
        if (!result.hasUpdate) {
          return
        }
      } else {
        // 版本仍有效，推送 downloaded 状态（pending 转为正式 downloaded）
        console.log('[更新] 本地安装包仍有效, 推送 downloaded 状态')
        pendingManifestInfo = null
        setStatus({
          status: 'downloaded',
          version: localVersion!,
          releaseNotes: result.releaseNotes,
          forceUpdate: result.forceUpdate,
          releaseType: result.releaseType,
        })
        return
      }
    }

    if (!result.hasUpdate) {
      console.log('[更新] 无可用更新, hint=%s', result.hint || '无')
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

    console.log('[更新] upgradeInfo 赋值完毕:')
    console.log('[更新]   downloadUrl=%s', upgradeInfo.downloadUrl ? '有' : '空')
    console.log('[更新]   fileName=%s', upgradeInfo.fileName || '空')
    console.log('[更新]   sha256=%s', upgradeInfo.sha256 ? '有' : '空')
    console.log('[更新]   fileSize=%s', upgradeInfo.fileSize)
    console.log('[更新]   packageType=%s', upgradeInfo.packageType)
    console.log('[更新]   latestVersion=%s', upgradeInfo.latestVersion)
    console.log('[更新]   releaseType=%s', upgradeInfo.releaseType)

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

    if (silent) {
      // 静默检查（如设置页自动刷新）：失败时退回 idle，不打扰用户
      console.log('[更新] 静默检测失败: %s', err instanceof Error ? err.message : String(err))
      setStatus({ status: 'idle' })
    } else if (manual) {
      setStatus({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    } else {
      // 周期/自动检测失败不展示错误，静默恢复 idle
      console.log('[更新] 自动检测异常(静默): %s', err instanceof Error ? err.message : String(err))
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

  // 1. 恢复 manifest（上次下载未安装的包），仅加载到 upgradeInfo，不推送状态
  const hasPendingManifest = restoreManifest()

  // 2. 启动首次检测
  if (hasPendingManifest) {
    // 有未安装的安装包，立即向服务端验证版本是否仍有效
    console.log('[更新] 发现待验证安装包，立即向服务端验证')
    checkTimer = setTimeout(() => {
      checkForUpdates().catch((err) => console.error('[更新] 首次检查失败:', err))
    }, 3_000)  // 3秒后触发，给窗口初始化留时间
  } else {
    const firstDelay = randomInRange(10_000, 3_600_000)  // 10秒~60分钟
    console.log('[更新] 首检延迟 %d 秒', Math.round(firstDelay / 1000))
    checkTimer = setTimeout(() => {
      checkForUpdates().catch((err) => console.error('[更新] 首次检查失败:', err))
    }, firstDelay)
  }

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

  const delay = randomInRange(6 * 3600_000, 8 * 3600_000)
  console.log('[更新] 下次周期检测 %d 小时后', Math.round(delay / 3600_000))
  checkTimer = setTimeout(() => {
    // 检查是否有 token（已登出则跳过）
    if (!getToken()) {
      console.log('[更新] 无 token，跳过定时检查')
      scheduleNextCheck()
      return
    }
    // 已下载时也继续周期检查，以便检测服务端是否暂停了此版本
    checkForUpdates().catch((err) => console.error('[更新] 周期检查失败:', err))
  }, delay)
}

/** 恢复上次下载的 manifest，仅加载到 upgradeInfo，不推送状态 */
function restoreManifest(): boolean {
  try {
    const manifest = loadManifest()
    if (!manifest) return false

    // 版本方向仍有效
    if (manifest.releaseType && !isValidVersionDirection(
      app.getVersion(), manifest.version, manifest.releaseType,
    )) {
      console.log('[更新] manifest 版本方向失效，删除')
      deleteInstaller(manifest.fileName)
      deleteManifest()
      return false
    }

    // 文件存在
    const path = getInstallerPath(manifest.fileName)
    const { existsSync } = require('node:fs')
    if (!existsSync(path)) {
      console.log('[更新] manifest 安装包不存在，删除')
      deleteManifest()
      return false
    }

    // 恢复内部信息（不推送 downloaded 状态，由首次 checkForUpdates 向服务端验证后推送）
    upgradeInfo = {
      fileName: manifest.fileName,
      sha256: manifest.sha256,
      fileSize: manifest.fileSize,
      packageType: manifest.packageType,
    }
    upgradeInfo.releaseType = manifest.releaseType
    upgradeInfo.latestVersion = manifest.version

    // 暂存版本信息，供首次 checkForUpdates 验证后使用
    pendingManifestInfo = {
      version: manifest.version,
      releaseNotes: manifest.releaseNotes,
      forceUpdate: manifest.forceUpdate,
      releaseType: manifest.releaseType,
      hint: manifest.hint,
    }

    console.log('[更新] manifest 数据已加载 version=%s，等待服务端验证', manifest.version)
    return true
  } catch (err) {
    console.error('[更新] manifest 恢复异常:', err)
    deleteManifest()
    return false
  }
}

/** 执行下载 */
async function doDownload(): Promise<void> {
  console.log('[更新] doDownload 入口:')
  console.log('[更新]   downloadUrl=%s', upgradeInfo.downloadUrl || '空')
  console.log('[更新]   fileName=%s', upgradeInfo.fileName || '空')

  if (!upgradeInfo.downloadUrl || !upgradeInfo.fileName) {
    console.error('[更新] doDownload 被阻止: downloadUrl=%s fileName=%s',
      upgradeInfo.downloadUrl ? '有' : '空',
      upgradeInfo.fileName ? '有' : '空')
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

  console.log('[更新] manifest 已保存, 推送 downloaded 状态')
  setStatus({
    status: 'downloaded',
    version: current.version || '',
    releaseNotes: current.releaseNotes,
    forceUpdate: current.forceUpdate,
    releaseType: current.releaseType,
  })
  console.log('[更新] downloaded 状态已推送')
}
