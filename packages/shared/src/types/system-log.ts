/**
 * 系统日志查看相关类型
 */

export type SystemLogFile = 'main' | 'renderer'

export interface SystemLogReadInput {
  /** 日志文件：main.log 或 renderer.log */
  file: SystemLogFile
  /** 从文件尾部读取的最大字节数 */
  maxBytes?: number
}

export interface SystemLogReadResult {
  file: SystemLogFile
  fileName: string
  path: string
  logsDir: string
  exists: boolean
  content: string
  sizeBytes: number
  readBytes: number
  truncated: boolean
  updatedAt: number | null
}

export const SYSTEM_LOG_IPC_CHANNELS = {
  READ: 'system-log:read',
  OPEN_DIR: 'system-log:open-dir',
} as const
