import type { AgentExpertGroupInfo } from '@proma/shared'

/** 远程下载来源判定：仅 user:remote/* 才参与召唤时自动升级 */
export function isRemoteSourced(group: AgentExpertGroupInfo): boolean {
  return group.sourcePluginId.startsWith('user:remote/')
}

/** 本地已安装、可进入召唤（含升级）流程的状态 */
export function isSummonableLocal(group: AgentExpertGroupInfo): boolean {
  return group.status === 'available' || group.status === 'remote_update_available'
}
