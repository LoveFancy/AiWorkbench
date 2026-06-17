/**
 * 专家团服务端化 Atom
 *
 * 管理服务端专家团列表、精选场景、远程下载状态。
 */

import { atom } from 'jotai'
import type { ServerExpertGroupSummary, FeaturedScene } from '@proma/shared'

/** 服务端专家团列表摘要 */
export const serverExpertGroupsAtom = atom<ServerExpertGroupSummary[]>([])

/** 精选场景分类 */
export const featuredScenesAtom = atom<FeaturedScene[]>([])

/** 拉取服务端专家团列表 */
export const fetchServerExpertGroupsAtom = atom(null, async (_get, set) => {
  try {
    const items = await window.electronAPI.fetchServerExpertGroups()
    set(serverExpertGroupsAtom, items)
  } catch (err) {
    console.warn('[expert] 获取服务端专家团列表失败，使用缓存降级:', err)
  }
})

/** 拉取精选场景 */
export const fetchFeaturedScenesAtom = atom(null, async (_get, set) => {
  try {
    const scenes = await window.electronAPI.fetchFeaturedScenes()
    set(featuredScenesAtom, scenes)
  } catch (err) {
    console.warn('[expert] 获取精选场景失败:', err)
  }
})

/** 同时拉取服务端专家团列表和精选场景 */
export const loadRemoteExpertDataAtom = atom(null, async (_get, set) => {
  await Promise.all([
    set(fetchServerExpertGroupsAtom),
    set(fetchFeaturedScenesAtom),
  ])
})
