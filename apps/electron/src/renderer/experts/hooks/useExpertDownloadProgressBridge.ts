import * as React from 'react'
import { useSetAtom } from 'jotai'
import { expertDownloadProgressAtom } from '@/experts/atoms/expert-remote'
import { loadAgentExpertGroupsAtom } from '@/atoms/agent-atoms'

/**
 * 全局下载进度桥接：订阅主进程 DOWNLOAD_PROGRESS 事件，写入 expertDownloadProgressAtom。
 *
 * 只需在专家视图根组件挂载一次。终态（done/cancelled/error）短暂展示后清理；
 * done 时刷新本地专家团列表，使新安装的专家变为可召唤。
 */
export function useExpertDownloadProgressBridge(): void {
  const setProgress = useSetAtom(expertDownloadProgressAtom)
  const loadGroups = useSetAtom(loadAgentExpertGroupsAtom)

  React.useEffect(() => {
    return window.electronAPI.onExpertDownloadProgress((p) => {
      setProgress((prev) => {
        const next = new Map(prev)
        next.set(p.groupId, p)
        return next
      })

      if (p.status === 'done' || p.status === 'cancelled' || p.status === 'error') {
        if (p.status === 'done') void loadGroups()
        setTimeout(() => {
          setProgress((prev) => {
            // 仅当条目仍是触发本次清理的那条事件时才删除；
            // 若 1.5s 内同一 group 又有新进度（如重新下载），引用已变化，保留新条目。
            if (prev.get(p.groupId) !== p) return prev
            const next = new Map(prev)
            next.delete(p.groupId)
            return next
          })
        }, 1500)
      }
    })
  }, [setProgress, loadGroups])
}
