/**
 * Installer Manifest 客户端
 *
 * 从 proma-api 的 /api/v1/installers/manifest 接口拉取第三方安装包清单，
 * 带 5 分钟缓存和内置 fallback——断网或接口不可用时至少能拿到官方上游 URL。
 */

import type { InstallerManifest, InstallerSource } from '@proma/shared'

const PROMA_API_BASE = 'https://api.proma.cool'
const MANIFEST_URL = `${PROMA_API_BASE}/api/v1/installers/manifest`
const CACHE_TTL_MS = 5 * 60 * 1000

interface ManifestCache {
  data: InstallerManifest
  timestamp: number
}

let cache: ManifestCache | null = null

const MANAGED_WINDOWS_X64_INSTALLERS: InstallerSource[] = [
  {
    id: 'git-for-windows',
    platform: 'win32',
    arch: 'x64',
    version: '2.54.0',
    downloadUrl: 'https://htpan.htsc.com.cn/l/iFghB9',
    fallbackUrl: '',
    sha256: '',
    sizeBytes: 76000000,
    filename: 'Git-2.54.0-64-bit.exe',
  },
  {
    id: 'nodejs',
    platform: 'win32',
    arch: 'x64',
    version: '24.15.0',
    downloadUrl: 'https://htpan.htsc.com.cn/l/vF2xEX',
    fallbackUrl: '',
    sha256: '',
    sizeBytes: 32000000,
    filename: 'node-v24.15.0-x64.msi',
  },
]

function installerKey(source: Pick<InstallerSource, 'id' | 'platform' | 'arch'>): string {
  return `${source.id}:${source.platform}:${source.arch}`
}

/**
 * 对远程清单做本地覆盖，确保 Windows x64 使用内网托管的安装包。
 */
function applyManagedInstallerOverrides(manifest: InstallerManifest): InstallerManifest {
  const managedByKey = new Map(
    MANAGED_WINDOWS_X64_INSTALLERS.map((source) => [installerKey(source), source]),
  )
  const usedKeys = new Set<string>()

  const installers = manifest.installers.map((source) => {
    const key = installerKey(source)
    const managed = managedByKey.get(key)
    if (!managed) return source

    usedKeys.add(key)
    return managed
  })

  for (const managed of MANAGED_WINDOWS_X64_INSTALLERS) {
    const key = installerKey(managed)
    if (!usedKeys.has(key)) {
      installers.push(managed)
    }
  }

  return { installers }
}

/**
 * 内置 fallback manifest。
 *
 * 断网或 API 不可达时使用。sha256 留空时，下载器会跳过校验并打 warning。
 */
const BUILTIN_FALLBACK: InstallerManifest = {
  installers: [
    MANAGED_WINDOWS_X64_INSTALLERS[0]!,
    {
      id: 'git-for-windows',
      platform: 'win32',
      arch: 'arm64',
      version: '2.47.1',
      downloadUrl: '',
      fallbackUrl:
        'https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.1/Git-2.47.1-arm64.exe',
      sha256: '',
      sizeBytes: 66000000,
      filename: 'Git-2.47.1-arm64.exe',
    },
    MANAGED_WINDOWS_X64_INSTALLERS[1]!,
    {
      id: 'nodejs',
      platform: 'win32',
      arch: 'arm64',
      version: '22.13.1',
      downloadUrl: '',
      fallbackUrl: 'https://nodejs.org/dist/v22.13.1/node-v22.13.1-arm64.msi',
      sha256: '',
      sizeBytes: 28000000,
      filename: 'node-v22.13.1-arm64.msi',
    },
  ],
}

/**
 * 拉取安装包清单（优先远程，失败回退内置）
 */
export async function fetchInstallerManifest(force = false): Promise<InstallerManifest> {
  if (!force && cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.data
  }

  try {
    const response = await fetch(MANIFEST_URL, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Proma-Desktop-App',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = (await response.json()) as InstallerManifest
    if (!data || !Array.isArray(data.installers)) {
      throw new Error('Manifest format invalid')
    }

    const manifest = applyManagedInstallerOverrides(data)
    cache = { data: manifest, timestamp: Date.now() }
    console.log(`[Installer Manifest] 远程清单获取成功，共 ${manifest.installers.length} 项`)
    return manifest
  } catch (error) {
    console.warn(
      `[Installer Manifest] 远程清单获取失败，降级到内置 fallback:`,
      error,
    )
    // 不缓存 fallback，下一次仍然先试远程
    return BUILTIN_FALLBACK
  }
}

/**
 * 从清单中挑出匹配指定 (id, arch) 的条目
 */
export function findInstallerSource(
  manifest: InstallerManifest,
  id: string,
  arch: 'x64' | 'arm64',
): InstallerSource | undefined {
  return manifest.installers.find((s) => s.id === id && s.arch === arch)
}
