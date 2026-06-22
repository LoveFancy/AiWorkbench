/**
 * 日志上报模块
 *
 * 将本地 main.log / renderer.log 打包为 zip，通过 httpUpload
 * 上传到服务端 POST /workmate/logs/upload。
 *
 * URL 域名由 hteip-client 内部自动拼接，调用方只需传路径。
 */

import AdmZip from 'adm-zip'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { app } from 'electron'
import { getUserProfile } from './user-profile-service'
import { httpUpload, resolveApiBase } from '../../shared/hteip-client'
import type { HttpResponse } from '../../shared/hteip-client'
import type { UserProfile } from '../../types'

// ── 常量 ──

/** 上传接口路径（域名由 hteip-client 内部拼接） */
const UPLOAD_PATH = '/workmate/logs/upload'

/** jobId 禁止字符（与后端保持一致） */
const JOB_ID_FORBIDDEN = '/\\:?*"<>|'

// ── 类型 ──

export interface LogUploadInput {
  /** 用户工号，为空时从 UserProfile.userName 兜底 */
  staffId?: string
}

interface LogUploadSuccess {
  success: true
  fileName: string
  fileSize?: number
  uploadedAt?: string
}

interface LogUploadError {
  success: false
  error: string
}

export type LogUploadResult = LogUploadSuccess | LogUploadError

/** IPC 通道名——硬编码，不修改 shared 包 */
export const LOG_UPLOAD_IPC_CHANNEL = 'system-log:upload'

// ── jobId ──

function resolveJobId(input: LogUploadInput): string {
  const fromInput = input.staffId?.trim()
  if (fromInput) return fromInput
  const profile: UserProfile = getUserProfile()
  return profile.userName?.trim() || 'unknown'
}

function validateJobId(jobId: string): void {
  if (!jobId || /\.\./.test(jobId)) {
    throw new Error('用户标识无效')
  }
  for (const ch of jobId) {
    if (JOB_ID_FORBIDDEN.indexOf(ch) >= 0) {
      throw new Error('用户标识包含非法字符')
    }
  }
}

// ── 打包 ──

function collectLogFiles(logsDir: string): Array<{ name: string; data: Buffer }> {
  const files: Array<{ name: string; data: Buffer }> = []
  for (const name of ['main.log', 'renderer.log']) {
    const filePath = join(logsDir, name)
    if (existsSync(filePath)) {
      files.push({ name, data: readFileSync(filePath) })
    }
  }
  if (files.length === 0) {
    throw new Error('没有可上报的日志文件')
  }
  return files
}

function buildClientFileName(jobId: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStr = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-')
  const timeStr = [pad(now.getHours()), pad(now.getMinutes())].join('-')
  return `${jobId}_${dateStr}-${timeStr}_log.zip`
}

// ── 上传 ──

interface UploadApiResponse {
  code: number
  message: string
  data?: { fileName: string; fileSize: number; uploadedAt: string }
}

async function httpUploadZip(
  zipBuffer: Buffer,
  clientFileName: string,
  jobId: string,
): Promise<LogUploadResult> {
  const formData = new FormData()
  formData.append('file', new Blob([new Uint8Array(zipBuffer)], { type: 'application/zip' }), clientFileName)
  formData.append('userId', jobId)

  console.log('[日志上报]  POST %s', `${resolveApiBase()}${UPLOAD_PATH}`)

  const res: HttpResponse<UploadApiResponse> = await httpUpload<UploadApiResponse>(
    UPLOAD_PATH,
    { formData },
  )

  if (res.ok && res.data?.code === 0 && res.data.data) {
    console.log('[日志上报]  上传成功: %s (%d KB)', res.data.data.fileName, (res.data.data.fileSize / 1024).toFixed(1))
    return {
      success: true,
      fileName: res.data.data.fileName,
      fileSize: res.data.data.fileSize,
      uploadedAt: res.data.data.uploadedAt,
    }
  }

  const errorMsg = res.error || res.data?.message || `上传失败 (HTTP ${res.status})`
  console.error('[日志上报]  上传失败: %s', errorMsg)
  return { success: false, error: errorMsg }
}

// ── 入口 ──

/**
 * 将本地日志打包为 zip 并上传到服务端。
 */
export async function uploadSystemLog(
  input: LogUploadInput,
): Promise<LogUploadResult> {
  const jobId = resolveJobId(input)
  validateJobId(jobId)

  const logsDir = app.getPath('logs')
  const logFiles = collectLogFiles(logsDir)

  console.log(
    '[日志上报] 收集到 %d 个日志文件: %s',
    logFiles.length,
    logFiles.map((f) => `${f.name} (${(f.data.byteLength / 1024).toFixed(1)} KB)`).join(', '),
  )

  const zip = new AdmZip()
  for (const { name, data } of logFiles) {
    zip.addFile(name, data)
  }
  const zipBuffer = zip.toBuffer()

  const clientFileName = buildClientFileName(jobId)

  console.log(
    `[日志上报] 已打包准备上传: ${clientFileName} (${(zipBuffer.byteLength / 1024).toFixed(1)} KB)`,
  )

  return httpUploadZip(zipBuffer, clientFileName, jobId)
}
