/**
 * 专家团下载服务
 *
 * 管理从服务端下载专家团插件包：流式下载 + installUserPluginZip + 进度广播。
 * 下载走 fetch + Cookie 注入，与 updater 下载逻辑一致。
 */

import { dirname } from 'node:path'
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { app, BrowserWindow } from 'electron'
import type { AgentPluginInfo, RemoteDownloadProgress } from '@proma/shared'
import { EXPERT_IPC_CHANNELS } from '@proma/shared'
import { installUserPluginZip } from './plugin-registry-service'
import { getToken } from '../../auth'
import { resolveApiBase } from '../../shared/hteip-client'

function broadcastProgress(progress: RemoteDownloadProgress): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(EXPERT_IPC_CHANNELS.DOWNLOAD_PROGRESS, progress)
  })
}

/** 流式下载文件，支持进度回调 */
async function downloadFile(
  url: string,
  destPath: string,
  onProgress: (downloaded: number, total: number) => void,
): Promise<void> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) {
    headers['Cookie'] = `EIPGW-TOKEN=${token}`
  }

  const response = await fetch(url, { headers })

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

export async function downloadAndInstallRemoteExpert(
  groupId: string,
): Promise<AgentPluginInfo> {
  const downloadPath = `/workmate/expert-groups/${groupId}/download`
  const downloadUrl = `${resolveApiBase()}${downloadPath}`
  const tempPath = `${app.getPath('temp')}\\proma-expert-${groupId}-${Date.now()}.zip`

  // 1. 广播下载开始
  broadcastProgress({ groupId, status: 'downloading', progress: 0, downloadedBytes: 0, totalBytes: 0 })

  try {
    // 2. 流式下载
    await downloadFile(downloadUrl, tempPath, (downloaded, total) => {
      const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0
      broadcastProgress({ groupId, status: 'downloading', progress, downloadedBytes: downloaded, totalBytes: total })
    })

    // 3. 广播安装中
    broadcastProgress({ groupId, status: 'installing', progress: 100, downloadedBytes: 0, totalBytes: 0 })

    // 4. 安装插件（marketplaceId: 'remote' 安装到 user-plugins/remote/）
    const plugin = installUserPluginZip(tempPath, { marketplaceId: 'remote' })

    // 5. 清理临时文件
    try { unlinkSync(tempPath) } catch { /* ignore */ }

    // 6. 广播完成
    broadcastProgress({ groupId, status: 'done', progress: 100, downloadedBytes: 0, totalBytes: 0 })

    return plugin
  } catch (error) {
    try { unlinkSync(tempPath) } catch { /* ignore */ }
    const message = error instanceof Error ? error.message : String(error)
    broadcastProgress({ groupId, status: 'error', progress: 0, downloadedBytes: 0, totalBytes: 0, error: message })
    throw error
  }
}
