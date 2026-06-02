import { PrismaClient } from '@prisma/client'
import { matchAnyRule } from '../utils/whitelist-matcher'
import { getActiveWhitelistRules } from './whitelist.service'
import { logger } from '../utils/logger'
import type { UpgradeCheckRequest, UpgradeCheckResponse } from '../types'

const prisma = new PrismaClient()

function compareVersion(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  const length = Math.max(parts1.length, parts2.length)

  for (let i = 0; i < length; i++) {
    const a = parts1[i] ?? 0
    const b = parts2[i] ?? 0
    if (a > b) return 1
    if (a < b) return -1
  }
  return 0
}

export async function checkUpgrade(
  req: UpgradeCheckRequest,
  userId: string
): Promise<UpgradeCheckResponse> {
  const { currentVersion, platform } = req

  const activeRelease = await prisma.upgradeRelease.findFirst({
    where: {
      platform,
      isActive: true,
    },
  })

  if (!activeRelease) {
    return {
      hasUpdate: false,
      forceUpdate: false,
      releaseType: null,
      latestVersion: null,
      downloadUrl: null,
      releaseNotes: null,
      minVersion: null,
      hint: null,
    }
  }

  const isRollback = activeRelease.releaseType === 'ROLLBACK'

  if (isRollback) {
    if (compareVersion(currentVersion, activeRelease.version) <= 0) {
      return {
        hasUpdate: false,
        forceUpdate: false,
        releaseType: null,
        latestVersion: null,
        downloadUrl: null,
        releaseNotes: null,
        minVersion: null,
        hint: null,
      }
    }
  } else {
    if (activeRelease.minVersion) {
      if (compareVersion(currentVersion, activeRelease.minVersion) < 0) {
        return {
          hasUpdate: false,
          forceUpdate: false,
          releaseType: null,
          latestVersion: null,
          downloadUrl: null,
          releaseNotes: null,
          minVersion: null,
          hint: `当前版本过低，建议先升级到 ${activeRelease.minVersion}`,
        }
      }
    }

    if (compareVersion(currentVersion, activeRelease.version) >= 0) {
      return {
        hasUpdate: false,
        forceUpdate: false,
        releaseType: null,
        latestVersion: null,
        downloadUrl: null,
        releaseNotes: null,
        minVersion: null,
        hint: null,
      }
    }
  }

  const whitelistRules = await getActiveWhitelistRules({
    platform,
    targetVersion: activeRelease.version,
  })

  const inWhitelist = whitelistRules.length > 0 ? matchAnyRule(userId, whitelistRules) : false

  if (!inWhitelist) {
    return {
      hasUpdate: false,
      forceUpdate: false,
      releaseType: null,
      latestVersion: null,
      downloadUrl: null,
      releaseNotes: null,
      minVersion: null,
      hint: null,
    }
  }

  return {
    hasUpdate: true,
    forceUpdate: false,
    releaseType: activeRelease.releaseType as 'UPGRADE' | 'ROLLBACK',
    latestVersion: activeRelease.version,
    downloadUrl: activeRelease.downloadUrl,
    releaseNotes: activeRelease.releaseNotes,
    minVersion: activeRelease.minVersion ?? null,
    hint: isRollback ? `当前版本将回退到 ${activeRelease.version}` : null,
  }
}

export async function getActiveRelease(platform: string) {
  return prisma.upgradeRelease.findFirst({
    where: { platform, isActive: true },
  })
}

export async function createRelease(data: {
  version: string
  releaseType: string
  releaseNotes: string
  downloadUrl: string
  platform: string
  minVersion?: string
}) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.upgradeRelease.updateMany({
      where: { platform: data.platform, isActive: true },
      data: { isActive: false },
    })

    return tx.upgradeRelease.create({
      data: {
        version: data.version,
        releaseType: data.releaseType as 'UPGRADE' | 'ROLLBACK',
        releaseNotes: data.releaseNotes,
        downloadUrl: data.downloadUrl,
        platform: data.platform,
        minVersion: data.minVersion ?? null,
        isActive: true,
      },
    })
  })

  return result
}

export async function rollbackRelease(platform: string, targetVersion: string) {
  const targetRelease = await prisma.upgradeRelease.findFirst({
    where: { platform, version: targetVersion },
  })

  if (!targetRelease) {
    throw new Error(`版本 ${targetVersion} (${platform}) 不存在`)
  }

  await prisma.upgradeWhitelist.deleteMany({
    where: {
      platform,
      sourceStrategyId: { not: null },
    },
  })

  const result = await prisma.$transaction(async (tx) => {
    await tx.upgradeRelease.updateMany({
      where: { platform, isActive: true },
      data: { isActive: false },
    })

    return tx.upgradeRelease.update({
      where: { id: targetRelease.id },
      data: { isActive: true },
    })
  })

  return result
}

export async function listReleases(params: {
  page: number
  pageSize: number
  platform?: string
}) {
  const where: Record<string, unknown> = {}
  if (params.platform) {
    where.platform = params.platform
  }

  const [total, releases] = await Promise.all([
    prisma.upgradeRelease.count({ where }),
    prisma.upgradeRelease.findMany({
      where,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      orderBy: { publishedAt: 'desc' },
    }),
  ])

  return { total, releases }
}