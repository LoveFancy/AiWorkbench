/**
 * 系统日志读取服务
 *
 * 只暴露固定日志文件，不接受任意路径，避免 renderer 侧读取本地任意文件。
 */

import { existsSync, openSync, readSync, closeSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { SystemLogFile, SystemLogReadResult } from '@proma/shared'

const DEFAULT_MAX_LOG_BYTES = 1024 * 1024

interface ReadSystemLogFileInput {
  logsDir: string
  file: SystemLogFile
  maxBytes?: number
}

function getSystemLogFileName(file: SystemLogFile): string {
  return file === 'main' ? 'main.log' : 'renderer.log'
}

function normalizeMaxBytes(maxBytes: number | undefined): number {
  if (!Number.isFinite(maxBytes) || !maxBytes || maxBytes <= 0) return DEFAULT_MAX_LOG_BYTES
  return Math.min(Math.floor(maxBytes), 10 * 1024 * 1024)
}

function readFileTail(filePath: string, sizeBytes: number, maxBytes: number): { content: string; readBytes: number; truncated: boolean } {
  const readBytes = Math.min(sizeBytes, maxBytes)
  const start = Math.max(0, sizeBytes - readBytes)
  const buffer = Buffer.alloc(readBytes)
  const fd = openSync(filePath, 'r')

  try {
    const bytesRead = readSync(fd, buffer, 0, readBytes, start)
    return {
      content: buffer.subarray(0, bytesRead).toString('utf-8'),
      readBytes: bytesRead,
      truncated: sizeBytes > bytesRead,
    }
  } finally {
    closeSync(fd)
  }
}

export function readSystemLogFile(input: ReadSystemLogFileInput): SystemLogReadResult {
  const fileName = getSystemLogFileName(input.file)
  const filePath = join(input.logsDir, fileName)

  if (!existsSync(filePath)) {
    return {
      file: input.file,
      fileName,
      path: filePath,
      logsDir: input.logsDir,
      exists: false,
      content: '',
      sizeBytes: 0,
      readBytes: 0,
      truncated: false,
      updatedAt: null,
    }
  }

  const stats = statSync(filePath)
  const maxBytes = normalizeMaxBytes(input.maxBytes)
  const tail = readFileTail(filePath, stats.size, maxBytes)

  return {
    file: input.file,
    fileName,
    path: filePath,
    logsDir: input.logsDir,
    exists: true,
    content: tail.content,
    sizeBytes: stats.size,
    readBytes: tail.readBytes,
    truncated: tail.truncated,
    updatedAt: stats.mtimeMs,
  }
}
