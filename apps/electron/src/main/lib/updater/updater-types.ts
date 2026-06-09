/**
 * 自动更新相关类型定义
 *
 * WorkMate Server 升级链路：检测 → 下载 → 校验 → 安装
 */

/** 更新状态（渲染端可见字段，不暴露内部字段如 sha256/fileSize） */
export type UpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'not-available'; hint?: string }
  | {
      status: 'available'
      version: string
      releaseNotes?: string
      forceUpdate?: boolean
      releaseType?: 'UPGRADE' | 'ROLLBACK'
      hint?: string
    }
  | {
      status: 'downloading'
      version: string
      releaseNotes?: string
      progress: DownloadProgress
      forceUpdate?: boolean
      releaseType?: 'UPGRADE' | 'ROLLBACK'
    }
  | {
      status: 'downloaded'
      version: string
      releaseNotes?: string
      forceUpdate?: boolean
      releaseType?: 'UPGRADE' | 'ROLLBACK'
      hint?: string
    }
  | { status: 'error'; error: string }

/** 下载进度 */
export interface DownloadProgress {
  /** 已下载百分比 0-100 */
  percent: number
  /** 已下载字节数 */
  transferred: number
  /** 总字节数，-1 表示未知 */
  total: number
  /** 下载速度（字节/秒） */
  bytesPerSecond: number
}

/** 更新 IPC 通道常量 */
export const UPDATER_IPC_CHANNELS = {
  CHECK_FOR_UPDATES: 'updater:check',
  GET_STATUS: 'updater:get-status',
  ON_STATUS_CHANGED: 'updater:status-changed',
  QUIT_AND_INSTALL: 'updater:quit-and-install',
} as const
