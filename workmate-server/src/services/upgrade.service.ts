import { PrismaClient } from '@prisma/client'
import { matchAnyRule } from '../utils/whitelist-matcher'
import { logger } from '../utils/logger'
import type { UpgradeCheckRequest, UpgradeCheckResponse, ReleaseType } from '../types'

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

/**
 * 升级检测核心逻辑（策略优先）：
 *
 * 1. 查找 ACTIVE 策略 → 无则返回 hasUpdate=false
 * 2. 白名单校验：
 *    - 全量阶段（当前阶段 rules 为空）→ 全员可用
 *    - 非全量阶段 → 合并已执行阶段的规则，匹配用户工号
 * 3. 版本比较：
 *    - UPGRADE: targetVersion > currentVersion 才提示
 *    - ROLLBACK: targetVersion < currentVersion 才提示
 * 4. 返回结果（releaseType 供端侧做二次版本判断）
 */
export async function checkUpgrade(
  req: UpgradeCheckRequest,
  userId: string
): Promise<UpgradeCheckResponse> {
  const { currentVersion, platform } = req
  const noUpdate: UpgradeCheckResponse = {
    hasUpdate: false,
    forceUpdate: false,
    releaseType: null,
    latestVersion: null,
    downloadUrl: null,
    releaseNotes: null,
    minVersion: null,
    hint: null,
  }

  // ===== Step 1: 查找激活的升级策略 =====

  const activeStrategy = await prisma.upgradeStrategy.findFirst({
    where: { platform, status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
    include: {
      stages: {
        orderBy: { stageOrder: 'asc' },
        include: { rules: true },
      },
    },
  })

  if (!activeStrategy) {
    logger.info('升级检测：无激活策略', { platform })
    return noUpdate
  }

  const { targetVersion, releaseType, downloadUrl, releaseNotes, minVersion } = activeStrategy
  logger.info('升级检测：找到激活策略', {
    strategyId: activeStrategy.id,
    strategyName: activeStrategy.name,
    targetVersion,
    releaseType,
    currentStage: activeStrategy.currentStage,
    platform,
  })

  // ===== Step 2: 白名单校验 =====

  // 获取已执行阶段（stageOrder <= currentStage）
  const executedStages = activeStrategy.stages.filter(
    (s) => s.stageOrder <= activeStrategy.currentStage
  )
  const currentStageData = executedStages[executedStages.length - 1]
  // 全量阶段判定：当前阶段无白名单规则 → 全量放开，所有用户均可升级/回退
  const isFullRollout = currentStageData && currentStageData.rules.length === 0

  if (!isFullRollout) {
    // 非全量阶段：合并所有已执行阶段的规则，匹配用户工号
    const allRules = executedStages.flatMap((s) => s.rules)
    if (allRules.length > 0) {
      const inWhitelist = matchAnyRule(userId, allRules.map((r) => ({
        ruleType: r.ruleType as 'list' | 'range' | 'prefix' | 'suffix',
        ruleValue: r.ruleValue,
      })))
      if (!inWhitelist) {
        logger.info('升级检测：用户不在白名单', { userId, targetVersion, platform })
        return noUpdate
      }
    }
  }

  // ===== Step 3: 版本比较 =====

  const currentCmp = compareVersion(currentVersion, targetVersion)

  if (releaseType === 'UPGRADE') {
    // 升级：当前版本必须 < 目标版本
    if (currentCmp >= 0) {
      logger.debug('升级检测：当前版本已是最新', { currentVersion, targetVersion })
      return noUpdate
    }
    if (minVersion && compareVersion(currentVersion, minVersion) < 0) {
      return {
        hasUpdate: true,
        forceUpdate: false,
        releaseType: releaseType as ReleaseType,
        latestVersion: targetVersion,
        downloadUrl: null,
        releaseNotes,
        minVersion,
        hint: `当前版本过低，请先升级到 ${minVersion}`,
      }
    }
  } else if (releaseType === 'ROLLBACK') {
    // 回退：当前版本必须 > 目标版本
    if (currentCmp <= 0) {
      logger.debug('升级检测：当前版本不高于回退目标', { currentVersion, targetVersion })
      return noUpdate
    }
  }

  // ===== Step 4: 返回升级/回退参数 =====

  return {
    hasUpdate: true,
    forceUpdate: false,
    releaseType: releaseType as ReleaseType,
    latestVersion: targetVersion,
    downloadUrl,
    releaseNotes,
    minVersion,
    hint: releaseType === 'ROLLBACK' ? `当前版本将回退到 ${targetVersion}` : null,
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
