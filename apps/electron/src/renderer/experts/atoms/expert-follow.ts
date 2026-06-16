/**
 * 专家团关注 & 最近使用 Atom
 */

import { atomWithStorage } from 'jotai/utils'
import { atom } from 'jotai'

/** 关注的专家团 ID → 关注时间戳 */
export const followedExpertGroupsAtom = atomWithStorage<Record<string, number>>(
  'followed-expert-groups', {}
)

/** 最近使用的专家团 ID → 最后使用时间戳 */
export const recentExpertGroupsAtom = atomWithStorage<Record<string, number>>(
  'recent-expert-groups', {}
)

/** 切换关注状态 */
export const toggleFollowExpertGroupAtom = atom(
  null,
  (get, set, expertGroupId: string) => {
    const followed = { ...get(followedExpertGroupsAtom) }
    if (followed[expertGroupId]) {
      delete followed[expertGroupId]
    } else {
      followed[expertGroupId] = Date.now()
    }
    set(followedExpertGroupsAtom, followed)
  }
)

/** 记录最近使用 */
export const recordRecentExpertGroupAtom = atom(
  null,
  (_get, set, expertGroupId: string) => {
    set(recentExpertGroupsAtom, (prev) => ({
      ...prev, [expertGroupId]: Date.now(),
    }))
  }
)
