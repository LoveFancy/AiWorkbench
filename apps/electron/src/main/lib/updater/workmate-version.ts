/**
 * WorkMate 版本工具
 *
 * SemVer 比较、版本方向校验、文件名版本提取。
 */

/**
 * 解析 SemVer 字符串为数字数组。
 * 支持 "1.2.0"、"1.2" 等格式。
 */
export function parseVersion(version: string): number[] {
  return version.split('.').map(Number)
}

/**
 * 比较两个 SemVer 版本。
 *
 * @returns 负数表示 a < b，0 表示相等，正数表示 a > b
 */
export function compareVersion(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  const len = Math.max(pa.length, pb.length)

  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na !== nb) return na - nb
  }

  return 0
}

/**
 * 校验版本方向是否合法。
 *
 * UPGRADE: latestVersion > currentVersion
 * ROLLBACK: latestVersion < currentVersion
 */
export function isValidVersionDirection(
  currentVersion: string,
  latestVersion: string,
  releaseType: 'UPGRADE' | 'ROLLBACK',
): boolean {
  if (releaseType === 'UPGRADE') {
    return compareVersion(latestVersion, currentVersion) > 0
  }
  if (releaseType === 'ROLLBACK') {
    return compareVersion(latestVersion, currentVersion) < 0
  }
  return false
}

/**
 * 从安装包文件名中提取版本号。
 *
 * 支持模式：
 * - WorkMate-1.2.0-win32-x64.exe
 * - WorkMate-1.2.0-darwin-arm64.dmg
 * - WorkMate-1.2.0-linux-x64.AppImage
 *
 * @returns 版本号字符串，提取失败返回 null
 */
export function extractVersionFromFileName(fileName: string): string | null {
  const match = fileName.match(/WorkMate-([\d.]+)-/)
  return match?.[1] ?? null
}
