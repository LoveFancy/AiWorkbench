/**
 * WorkMate 升级检测 API
 *
 * 调用 /workmate/upgrade/check，解析响应并做端侧二次校验。
 */

import { readFileSync, existsSync } from 'node:fs'
import { getSettingsPath } from '../config-paths'
import { httpGet } from '../../../shared/hteip-client'
import { compareVersion, isValidVersionDirection } from './workmate-version'

/** 从 settings.json 读取 eipGatewayBase（复用已有配置字段） */
function getEipGatewayBase(): string {
  const settingsPath = getSettingsPath()
  try {
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      if (typeof settings.eipGatewayBase === 'string' && settings.eipGatewayBase.trim()) {
        return settings.eipGatewayBase.trim()
      }
    }
  } catch { /* ignore */ }
  return 'http://eiplite.htsc.com.cn/gateway'
}

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
  const base = getEipGatewayBase()
  // 去掉 /gateway 后缀：登录用 /gateway/login，升级检测用 /workmate/upgrade/check
  const gatewayHost = base.replace(/\/gateway\/?$/, '')
  const url = `${gatewayHost}/workmate/upgrade/check?currentVersion=${encodeURIComponent(currentVersion)}&platform=${encodeURIComponent(platform)}&arch=${encodeURIComponent(arch)}`

  console.log('[升级检测] 请求 %s', url)

  const res = await httpGet<{ code: number; data: CheckApiResponse }>(url)

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

  // ===== 端侧二次校验 =====

  // 1. downloadUrl 为空 → 不进入下载流程
  if (!api.downloadUrl) {
    console.log('[升级检测] downloadUrl 为空, hint=%s', api.hint)
    return { hasUpdate: false, hint: api.hint || '暂无可用安装包' }
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
