/**
 * WorkMate 升级检测 API
 *
 * 调用 /workmate/upgrade/check，解析响应并做端侧二次校验。
 */

import { httpGet } from '../../../shared/hteip-client'
import { compareVersion, isValidVersionDirection } from './workmate-version'

/** 服务端 check 接口原始响应 */
export interface CheckApiResponse {
  hasUpdate: boolean
  forceUpdate: boolean
  releaseType?: 'UPGRADE' | 'ROLLBACK'
  latestVersion?: string
  downloadUrl?: string
  releaseNotes?: string
  minVersion?: string
  hint?: string
  publishedAt?: string
  sha256?: string
  fileSize?: number
  fileName?: string
  packageType?: string
}

/** 二次校验后的结果（供 auto-updater 使用） */
export interface CheckResult {
  /** 无更新 = 服务端返回 hasUpdate=false 或校验失败 */
  hasUpdate: boolean
  /** 无更新时可能有 hint（如 minVersion 过低提示） */
  hint?: string
  /** 以下字段仅在 hasUpdate=true 时有值 */
  forceUpdate?: boolean
  releaseType?: 'UPGRADE' | 'ROLLBACK'
  latestVersion?: string
  downloadUrl?: string
  releaseNotes?: string
  sha256?: string
  fileSize?: number
  fileName?: string
  packageType?: string
}

/**
 * 执行升级检测。
 *
 * @param currentVersion - 当前应用版本
 * @param platform - win32 / darwin / linux
 * @param arch - x64 / arm64
 */
export async function checkForWorkmateUpgrade(
  currentVersion: string,
  platform: string,
  arch: string,
): Promise<CheckResult> {
  const uptimePath = '/workmate/upgrade/check'

  console.log('[升级检测] 请求 %s (current=%s platform=%s arch=%s)', uptimePath, currentVersion, platform, arch)

  const res = await httpGet<{ code: number; data: CheckApiResponse }>(uptimePath, {
    params: { currentVersion, platform, arch },
  })

  if (!res.ok) {
    console.error('[升级检测] 网络错误 status=%d err=%s', res.status, res.error)
    throw new Error(res.error || '网络异常')
  }

  if (!res.data || res.data.code !== 0) {
    console.error('[升级检测] 服务端返回错误 code=%d msg=%s',
      res.data?.code ?? 'null', (res.data as any)?.message ?? '')
    throw new Error((res.data as any)?.message || '服务端异常')
  }

  const api = res.data.data

  if (!api.hasUpdate) {
    console.log('[升级检测] 无可用更新')
    return { hasUpdate: false }
  }

  // ===== 诊断日志：打印服务端返回的关键字段 =====
  console.log('[升级检测] 服务端返回 hasUpdate=true, 字段明细:')
  console.log('[升级检测]   latestVersion=%s', api.latestVersion)
  console.log('[升级检测]   releaseType=%s', api.releaseType)
  console.log('[升级检测]   forceUpdate=%s', api.forceUpdate)
  console.log('[升级检测]   downloadUrl=%s', api.downloadUrl ? '有' : '空')
  console.log('[升级检测]   fileName=%s', api.fileName || '空')
  console.log('[升级检测]   sha256=%s', api.sha256 ? '有' : '空')
  console.log('[升级检测]   fileSize=%s', api.fileSize)
  console.log('[升级检测]   packageType=%s', api.packageType)
  console.log('[升级检测]   minVersion=%s', api.minVersion)
  console.log('[升级检测]   hint=%s', api.hint)

  // ===== 端侧二次校验 =====

  // 1. downloadUrl 为空 → 不进入下载流程
  if (!api.downloadUrl) {
    console.log('[升级检测] downloadUrl 为空, 阻止升级, hint=%s', api.hint)
    return { hasUpdate: false, hint: api.hint || '暂无可用安装包' }
  }

  // 1.5. fileName 为空 → 不进入下载流程（下载入口需要 fileName）
  if (!api.fileName) {
    console.log('[升级检测] fileName 为空, 阻止升级')
    return { hasUpdate: false, hint: '服务端未提供安装包文件名' }
  }

  if (!api.sha256) {
    console.log('[升级检测] sha256 为空, 阻止升级')
    return { hasUpdate: false, hint: '服务端未提供安装包 SHA-256 校验值' }
  }

  // 2. 版本方向校验
  if (api.releaseType && api.latestVersion) {
    if (!isValidVersionDirection(currentVersion, api.latestVersion, api.releaseType)) {
      console.warn('[升级检测] 版本方向校验失败 current=%s latest=%s type=%s',
        currentVersion, api.latestVersion, api.releaseType)
      return { hasUpdate: false }
    }
  }

  // 3. minVersion 兜底：仅在 downloadUrl 有效时生效
  let forceUpdate = api.forceUpdate
  if (api.minVersion && compareVersion(currentVersion, api.minVersion) < 0) {
    console.log('[升级检测] 当前版本低于 minVersion，视为强制升级')
    forceUpdate = true
  }

  console.log('[升级检测] 检测完成 version=%s type=%s force=%s',
    api.latestVersion, api.releaseType, forceUpdate)

  return {
    hasUpdate: true,
    forceUpdate,
    releaseType: api.releaseType,
    latestVersion: api.latestVersion,
    downloadUrl: api.downloadUrl,
    releaseNotes: api.releaseNotes,
    sha256: api.sha256,
    fileSize: api.fileSize,
    fileName: api.fileName,
    packageType: api.packageType,
  }
}
