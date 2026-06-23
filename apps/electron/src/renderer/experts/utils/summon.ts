import type { AgentExpertGroupInfo, AgentExpertGroupStatus } from '@proma/shared'

/** 远程下载来源判定：仅 user:remote/* 才参与召唤时自动升级 */
export function isRemoteSourced(group: AgentExpertGroupInfo): boolean {
  return group.sourcePluginId.startsWith('user:remote/')
}

/** 本地已安装、可进入召唤（含升级）流程的状态 */
export function isSummonableLocal(group: AgentExpertGroupInfo): boolean {
  return group.status === 'available' || group.status === 'remote_update_available'
}

/**
 * 卡片「召唤/下载」按钮是否可点击。
 *
 * 必须与 useSummonExpert 的两条召唤分支保持一致：
 * - available / remote_update_available → 本地召唤（含按需升级）
 * - remote_not_downloaded / remote_downloading → 下载后召唤（按钮文案区分）
 * 其余状态（plugin_disabled / 校验失败 / remote_download_failed 等）禁用。
 */
export function isCardSummonActionable(status: AgentExpertGroupStatus): boolean {
  return (
    status === 'available' ||
    status === 'remote_update_available' ||
    status === 'remote_not_downloaded' ||
    status === 'remote_downloading'
  )
}
