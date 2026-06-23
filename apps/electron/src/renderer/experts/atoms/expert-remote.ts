/**
 * 专家团服务端化 Atom
 *
 * 管理服务端专家团列表、精选场景、远程下载状态。
 */

import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import type { ServerExpertGroupSummary, FeaturedScene, RemoteDownloadProgress } from '@proma/shared'

/** 服务端专家团列表摘要 */
export const serverExpertGroupsAtom = atom<ServerExpertGroupSummary[]>([])

/** 精选场景分类 */
export const featuredScenesAtom = atom<FeaturedScene[]>([])

/** 服务端专家团分类列表 */
export const expertCategoriesAtom = atom<string[]>([])

/** 各专家团下载进度 Map — groupId → RemoteDownloadProgress */
export const expertDownloadProgressAtom = atom<Map<string, RemoteDownloadProgress>>(new Map())

/** 按 groupId 切片订阅，避免任一进度更新触发所有卡片重渲染 */
export const expertDownloadProgressFamily = atomFamily((groupId: string) =>
  atom((get) => get(expertDownloadProgressAtom).get(groupId)),
)

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

/** 拉取服务端专家团分类列表 */
export const fetchExpertCategoriesAtom = atom(null, async (_get, set) => {
  try {
    const categories = await window.electronAPI.fetchServerExpertGroupCategories()
    set(expertCategoriesAtom, categories)
  } catch (err) {
    console.warn('[expert] 获取分类列表失败:', err)
  }
})

/** 同时拉取服务端专家团列表、精选场景和分类 */
export const loadRemoteExpertDataAtom = atom(null, async (_get, set) => {
  await Promise.all([
    set(fetchServerExpertGroupsAtom),
    set(fetchFeaturedScenesAtom),
    set(fetchExpertCategoriesAtom),
  ])
})
