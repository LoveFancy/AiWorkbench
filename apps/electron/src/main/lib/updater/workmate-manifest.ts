/**
 * WorkMate 升级 manifest 持久化
 *
 * 保存/读取/删除已下载安装包的元信息。
 * 文件存储在 getConfigDir()/upgrade/manifest.json
 */

import { basename, join, resolve } from 'node:path'
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { getConfigDir } from '../config-paths'

const SUB_DIR = 'upgrade'
const MANIFEST_FILE = 'manifest.json'

/** 支持的安装包扩展名白名单 */
const ALLOWED_EXTENSIONS = ['.exe', '.dmg', '.AppImage', '.deb', '.rpm']

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

/** 安装包完整路径（由 fileName 动态计算，仅取 basename 防止路径穿越） */
function installerPathFrom(fileName: string): string {
  const safeName = basename(fileName)
  if (safeName.includes('..') || safeName.includes('/') || safeName.includes('\\')) {
    throw new Error(`非法的文件名: ${safeName}`)
  }
  // 允许 .tmp 后缀（下载中临时文件）
  const nameToCheck = safeName.endsWith('.tmp') ? safeName.slice(0, -4) : safeName
  if (!ALLOWED_EXTENSIONS.some(ext => nameToCheck.endsWith(ext))) {
    throw new Error(`不允许的安装包文件类型: ${safeName}`)
  }
  const fullPath = resolve(upgradeDir(), safeName)
  if (!fullPath.startsWith(resolve(upgradeDir()))) {
    throw new Error(`安装包路径越界: ${fullPath}`)
  }
  return fullPath
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
