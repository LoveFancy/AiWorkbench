/**
 * 专家团召唤前升级服务
 *
 * 召唤已下载的远程专家团前，实时检查服务端版本（group-detail），
 * 若服务端版本更高则覆盖下载安装最新版。任何异常均降级为"用本地版本召唤"，
 * 绝不阻断召唤主路径。
 */

import type { AgentPluginInfo, EnsureExpertGroupLatestResult, ServerExpertGroupSummary } from '@proma/shared'
import { compareVersion } from './updater/workmate-version'

/** 升级编排的依赖注入点（便于测试，默认走真实实现） */
export interface EnsureExpertGroupLatestDeps {
  fetchDetail: (id: string) => Promise<ServerExpertGroupSummary | null>
  download: (id: string, options: { overwrite?: boolean; version?: string }) => Promise<AgentPluginInfo>
}

/** per-id 互斥：同一专家团的并发升级请求复用同一个 Promise，避免重复下载 + overwrite 写竞争 */
const inFlight = new Map<string, Promise<EnsureExpertGroupLatestResult>>()

/** 懒解析真实依赖：仅在未注入 deps 时加载，避免测试触发 electron 导入链 */
async function resolveDefaultDeps(): Promise<EnsureExpertGroupLatestDeps> {
  const [{ fetchServerExpertGroupDetail }, { downloadAndInstallRemoteExpert }] = await Promise.all([
    import('./expert-remote-service'),
    import('./expert-download-service'),
  ])
  return {
    fetchDetail: (id) => fetchServerExpertGroupDetail(id),
    download: (id, options) => downloadAndInstallRemoteExpert(id, options),
  }
}

/**
 * 召唤前确保专家团为最新版（尽力而为）。
 *
 * @param id           专家团 ID
 * @param localVersion 本地已安装版本
 * @param deps         依赖注入点，缺省时懒加载真实实现
 * @returns updated 是否实际下载了新版；任何异常均降级为 { updated:false }
 */
export function ensureExpertGroupLatest(
  id: string,
  localVersion: string,
  deps?: EnsureExpertGroupLatestDeps,
): Promise<EnsureExpertGroupLatestResult> {
  const existing = inFlight.get(id)
  if (existing) return existing

  const task = (async (): Promise<EnsureExpertGroupLatestResult> => {
    try {
      const resolved = deps ?? await resolveDefaultDeps()
      const detail = await resolved.fetchDetail(id)
      if (!detail) return { updated: false }                       // 检查失败 → 降级
      if (compareVersion(detail.version, localVersion) <= 0) {
        return { updated: false }                                  // 无更新
      }
      const plugin = await resolved.download(id, { overwrite: true, version: detail.version })
      return { updated: true, plugin }
    } catch (err) {
      console.warn('[expert-upgrade] 召唤前版本检查/升级失败，降级本地版: id=%s', id, err)
      return { updated: false }                                    // 下载失败 → 降级
    } finally {
      inFlight.delete(id)
    }
  })()

  inFlight.set(id, task)
  return task
}
