/**
 * WorkMate 升级 manifest 持久化
 *
 * 保存/读取/删除已下载安装包的元信息。
 * 文件存储在 getConfigDir()/upgrade/manifest.json
 */

import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { getConfigDir } from '../config-paths'

const SUB_DIR = 'upgrade'
const MANIFEST_FILE = 'manifest.json'

interface ManifestData {
  version: string
  releaseType: 'UPGRADE' | 'ROLLBACK'
  forceUpdate: boolean
  releaseNotes?: string
  downloadedAt: number
  sha256?: string
  fileSize?: number
  fileName: string
  packageType?: string
  hint?: string
}

function upgradeDir(): string {
  return join(getConfigDir(), SUB_DIR)
}

function manifestPath(): string {
  return join(upgradeDir(), MANIFEST_FILE)
}

/** 安装包完整路径（由 fileName 动态计算） */
function installerPathFrom(fileName: string): string {
  return join(upgradeDir(), fileName)
}

/** 保存 manifest */
export function saveManifest(data: ManifestData): void {
  if (!existsSync(upgradeDir())) {
    mkdirSync(upgradeDir(), { recursive: true })
  }
  writeFileSync(manifestPath(), JSON.stringify(data, null, 2), 'utf-8')
}

/** 读取 manifest */
export function loadManifest(): ManifestData | null {
  const path = manifestPath()
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

/** 删除 manifest */
export function deleteManifest(): void {
  const path = manifestPath()
  if (existsSync(path)) unlinkSync(path)
}

/** 删除已下载的安装包文件 */
export function deleteInstaller(fileName: string): void {
  const path = installerPathFrom(fileName)
  if (existsSync(path)) unlinkSync(path)
}

/** 获取安装包完整路径 */
export function getInstallerPath(fileName: string): string {
  return installerPathFrom(fileName)
}

/** 获取 upgrade 目录路径 */
export function getUpgradeDir(): string {
  return upgradeDir()
}
