/**
 * 专家团下载服务
 *
 * 管理从服务端下载专家团插件包：流式下载 + installUserPluginZipAsync + 进度广播。
 * 下载走 fetch + Cookie 注入，与 updater 下载逻辑一致；安装走异步分片解压避免阻塞主进程。
 */

import { dirname } from 'node:path'
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import * as electron from 'electron'
import type { AgentPluginInfo, RemoteDownloadProgress } from '@proma/shared'
import { EXPERT_IPC_CHANNELS } from '@proma/shared'
import { installUserPluginZipAsync, DownloadCancelledError } from './plugin-registry-service'
import { getToken } from '../../auth'
import { resolveApiBase } from '../../shared/hteip-client'

function broadcastProgress(progress: RemoteDownloadProgress): void {
  electron.BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(EXPERT_IPC_CHANNELS.DOWNLOAD_PROGRESS, progress)
  })
}

/** 进行中的下载/安装任务：controller 用于取消，promise 用于 per-groupId 单飞复用 */
interface ActiveDownload {
  controller: AbortController
  promise: Promise<AgentPluginInfo>
}

/** per-groupId 的进行中下载，用于取消与单飞（避免同一专家并发下载导致写竞争/取消失效） */
const activeDownloads = new Map<string, ActiveDownload>()

/** 取消指定专家团的下载/安装；未在进行中则安全 no-op */
export function cancelRemoteDownload(groupId: string): void {
  activeDownloads.get(groupId)?.controller.abort()
}

/** 仅测试用：注入 controller 以验证取消逻辑 */
export function __registerDownloadForTest(groupId: string, controller: AbortController): void {
  activeDownloads.set(groupId, { controller, promise: Promise.resolve({} as AgentPluginInfo) })
}

/** 流式下载文件，支持进度回调 */
async function downloadFile(
  url: string,
  destPath: string,
  onProgress: (downloaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) {
    headers['Cookie'] = `EIPGW-TOKEN=${token}`
  }

  // 连接超时与外部取消信号合并：任一触发都 abort。
  // 一旦开始流式传输（拿到响应），连接超时不再约束后续读取。
  const connectController = new AbortController()
  const connectTimer = setTimeout(() => connectController.abort(), 15_000)
  const mergedSignal = signal
    ? AbortSignal.any([signal, connectController.signal])
    : connectController.signal

  let response: Response
  try {
    response = await fetch(url, { headers, signal: mergedSignal })
  } finally {
    clearTimeout(connectTimer)
  }

  if (!response.ok) {
    throw new Error(`下载失败 HTTP ${response.status}`)
  }

  const total = parseInt(response.headers.get('content-length') ?? '0', 10)

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('无法获取响应流')
  }

  const destDir = dirname(destPath)
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

  const writeStream = createWriteStream(destPath)
  let downloaded = 0

  try {
    while (true) {
      if (signal?.aborted) throw new DownloadCancelledError()
      const { done, value } = await reader.read()
      if (done) break

      downloaded += value.byteLength
      onProgress(downloaded, total)

      const canContinue = writeStream.write(value)
      if (!canContinue) {
        await new Promise<void>((resolve) => writeStream.once('drain', resolve))
      }
    }
  } finally {
    writeStream.end()
    await new Promise<void>((resolve) => writeStream.once('finish', resolve))
    reader.cancel().catch(() => {})
  }
}

export function downloadAndInstallRemoteExpert(
  groupId: string,
  options: { overwrite?: boolean; version?: string } = {},
): Promise<AgentPluginInfo> {
  // 单飞：同一 groupId 已有进行中任务时复用，避免重复下载、目标目录写竞争与 controller 覆盖
  const existing = activeDownloads.get(groupId)
  if (existing) return existing.promise

  const downloadPath = `/workmate/expert-groups/${groupId}/download`
  const downloadUrl = `${resolveApiBase()}${downloadPath}`
  const tempPath = `${electron.app.getPath('temp')}\\proma-expert-${groupId}-${Date.now()}.zip`

  const controller = new AbortController()

  const task = (async (): Promise<AgentPluginInfo> => {
    // 1. 广播下载开始
    broadcastProgress({ groupId, status: 'downloading', progress: 0, downloadedBytes: 0, totalBytes: 0 })

    try {
      // 2. 流式下载（可取消）
      await downloadFile(downloadUrl, tempPath, (downloaded, total) => {
        const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0
        broadcastProgress({ groupId, status: 'downloading', progress, downloadedBytes: downloaded, totalBytes: total })
      }, controller.signal)

      // 3. 广播安装开始（解压前）
      broadcastProgress({
        groupId, status: 'installing', installStage: 'extracting',
        progress: 0, processedFiles: 0, totalFiles: 0, downloadedBytes: 0, totalBytes: 0,
      })

      // 4. 异步分片安装（不阻塞主进程；安装期可取消 + 解压真实进度）
      const plugin = await installUserPluginZipAsync(tempPath, {
        marketplaceId: 'remote',
        overwrite: options.overwrite ?? false,
        signal: controller.signal,
        version: options.version,
        onProgress: (p) => {
          if (p.stage === 'extracting') {
            // 解压进度映射到 0→95，给收尾留 95→100
            const progress = p.total > 0 ? Math.round((p.processed / p.total) * 95) : 0
            broadcastProgress({
              groupId, status: 'installing', installStage: 'extracting',
              progress, processedFiles: p.processed, totalFiles: p.total,
              downloadedBytes: 0, totalBytes: 0,
            })
          } else {
            // 解压完成，进入查重/写盘收尾
            broadcastProgress({
              groupId, status: 'installing', installStage: 'finalizing',
              progress: 95, downloadedBytes: 0, totalBytes: 0,
            })
          }
        },
      })

      // 5. 广播完成
      broadcastProgress({ groupId, status: 'done', progress: 100, downloadedBytes: 0, totalBytes: 0 })

      return plugin
    } catch (error) {
      const cancelled = controller.signal.aborted || error instanceof DownloadCancelledError
      if (cancelled) {
        broadcastProgress({ groupId, status: 'cancelled', progress: 0, downloadedBytes: 0, totalBytes: 0 })
        throw new DownloadCancelledError()
      }
      const message = error instanceof Error ? error.message : String(error)
      broadcastProgress({ groupId, status: 'error', progress: 0, downloadedBytes: 0, totalBytes: 0, error: message })
      throw error
    } finally {
      // 6. 取消/失败/成功都清理临时 zip 并注销本任务
      try { unlinkSync(tempPath) } catch { /* ignore */ }
      activeDownloads.delete(groupId)
    }
  })()

  activeDownloads.set(groupId, { controller, promise: task })
  return task
}
