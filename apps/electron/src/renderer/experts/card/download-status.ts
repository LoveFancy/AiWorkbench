import type { RemoteDownloadProgress } from '@proma/shared'

export type DownloadStatusTone = 'downloading' | 'installing' | 'error' | 'cancelled'
export type DownloadStatusAction = 'cancel' | 'retry' | 'download' | 'none'

export interface DownloadStatusView {
  tone: DownloadStatusTone
  /** 状态点颜色类 */
  dotClass: string
  /** 状态文案 */
  label: string
  /** 右侧百分比文本，null 则不显示 */
  percentText: string | null
  /** 是否显示进度条 */
  showBar: boolean
  /** 进度条填充百分比 0-100 */
  barPercent: number
  /** 右侧动作按钮 */
  action: DownloadStatusAction
}

/** 把下载/安装进度对象映射为底部状态区的展示视图（纯函数，便于单测） */
export function describeDownloadStatus(p: RemoteDownloadProgress): DownloadStatusView {
  if (p.status === 'error') {
    return { tone: 'error', dotClass: 'bg-red-500', label: '下载失败', percentText: null, showBar: false, barPercent: 0, action: 'retry' }
  }
  if (p.status === 'cancelled') {
    return { tone: 'cancelled', dotClass: 'bg-muted-foreground/40', label: '已取消', percentText: null, showBar: false, barPercent: 0, action: 'download' }
  }
  if (p.status === 'done') {
    return { tone: 'installing', dotClass: 'bg-emerald-500', label: '已完成', percentText: null, showBar: false, barPercent: 100, action: 'none' }
  }
  if (p.status === 'installing') {
    if (p.installStage === 'finalizing') {
      return { tone: 'installing', dotClass: 'bg-violet-500', label: '正在校验并写入…', percentText: null, showBar: true, barPercent: p.progress, action: 'cancel' }
    }
    const total = p.totalFiles ?? 0
    const processed = p.processedFiles ?? 0
    const label = total > 0 ? `正在解压 ${processed}/${total}` : '正在解压…'
    return { tone: 'installing', dotClass: 'bg-violet-500', label, percentText: `${p.progress}%`, showBar: true, barPercent: p.progress, action: 'cancel' }
  }
  // downloading（默认）
  return { tone: 'downloading', dotClass: 'bg-blue-500', label: '正在下载', percentText: `${p.progress}%`, showBar: true, barPercent: p.progress, action: 'cancel' }
}
