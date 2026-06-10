/**
 * WorkMate 安装包下载器
 *
 * 下载 .tmp 临时文件 → 校验 fileSize/sha256 → rename 正式文件
 * 处理 backpressure，推送下载进度。
 */

import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { rename, unlink } from 'node:fs/promises'
import { getUpgradeDir, getInstallerPath } from './workmate-manifest'
import { getToken } from '../../../auth'

export interface DownloadResult {
  /** 最终安装包路径 */
  installerPath: string
  /** SHA-256 校验值 */
  sha256: string
  /** 文件大小 (byte) */
  fileSize: number
}

export interface DownloadCallbacks {
  onProgress: (percent: number, transferred: number, total: number, bytesPerSecond: number) => void
}

function isLocalHttpHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname.startsWith('127.')
}

export function validateInstallerDownloadSecurity(
  url: string,
  expectedSha256: string | undefined,
): asserts expectedSha256 is string {
  const parsedUrl = new URL(url)
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('不支持的下载协议')
  }
  if (parsedUrl.protocol === 'http:' && !isLocalHttpHost(parsedUrl.hostname)) {
    throw new Error('生产环境下载安装包必须使用 HTTPS')
  }
  if (!expectedSha256) {
    throw new Error('安装包缺少 SHA-256 校验值')
  }
  if (!/^[a-fA-F0-9]{64}$/.test(expectedSha256)) {
    throw new Error('安装包 SHA-256 校验值格式非法')
  }
}

/**
 * 下载安装包。
 *
 * @param url - 下载地址
 * @param fileName - 服务端返回的文件名
 * @param expectedSha256 - 服务端返回的 sha256（可选）
 * @param expectedFileSize - 服务端返回的 fileSize（可选）
 * @param callbacks - 进度回调
 */
export async function downloadInstaller(
  url: string,
  fileName: string,
  expectedSha256: string | undefined,
  expectedFileSize: number | undefined,
  callbacks: DownloadCallbacks,
): Promise<DownloadResult> {
  validateInstallerDownloadSecurity(url, expectedSha256)

  const tmpPath = getInstallerPath(`${fileName}.tmp`)
  const finalPath = getInstallerPath(fileName)

  // 确保 upgrade 目录存在
  const dir = getUpgradeDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  console.log('[下载] 开始下载 %s → %s', url, tmpPath)

  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) {
    headers['Cookie'] = `EIPGW-TOKEN=${token}`
  }

  const response = await fetch(url, { headers })

  if (!response.ok) {
    throw new Error(`下载失败 HTTP ${response.status}`)
  }

  const total = response.headers.get('content-length')
    ? parseInt(response.headers.get('content-length')!, 10)
    : -1

  // 预先校验文件大小（如果服务端返回了）
  if (expectedFileSize && total > 0 && total !== expectedFileSize) {
    throw new Error(`文件大小不匹配：期望 ${expectedFileSize}，实际 ${total}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('无法获取响应流')
  }

  const writeStream = createWriteStream(tmpPath)
  const hash = createHash('sha256')
  let transferred = 0
  let lastReportTime = Date.now()
  let lastReportBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      transferred += value.byteLength
      hash.update(value)

      // backpressure: 等待 drain
      const canContinue = writeStream.write(value)
      if (!canContinue) {
        await new Promise<void>((resolve) => writeStream.once('drain', resolve))
      }

      // 进度推送（每秒最多 4 次）
      const now = Date.now()
      const elapsed = now - lastReportTime
      if (elapsed >= 250) {
        const bytesPerSecond = elapsed > 0
          ? Math.round((transferred - lastReportBytes) / (elapsed / 1000))
          : 0
        const percent = total > 0 ? Math.round((transferred / total) * 100) : -1
        callbacks.onProgress(percent, transferred, total, bytesPerSecond)
        lastReportTime = now
        lastReportBytes = transferred
      }
    }
  } finally {
    // 确保 stream 关闭
    writeStream.end()
    await new Promise<void>((resolve) => writeStream.once('finish', resolve))
    reader.cancel().catch(() => {})
  }

  const sha256 = hash.digest('hex')

  // 校验文件大小
  if (expectedFileSize && transferred !== expectedFileSize) {
    await unlink(tmpPath).catch(() => {})
    throw new Error(`下载后文件大小不匹配：期望 ${expectedFileSize}，实际 ${transferred}`)
  }

  // 校验 SHA-256
  if (sha256 !== expectedSha256) {
    await unlink(tmpPath).catch(() => {})
    throw new Error(`SHA-256 校验失败：期望 ${expectedSha256}，实际 ${sha256}`)
  }

  // 原子 rename
  await rename(tmpPath, finalPath)

  console.log('[下载] 完成 fileName=%s size=%d sha256=%s', fileName, transferred, sha256)

  return {
    installerPath: finalPath,
    sha256,
    fileSize: transferred,
  }
}
