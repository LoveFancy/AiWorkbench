import { PrismaClient } from '@prisma/client'
import type { RuleType, WhitelistRule } from '../utils/whitelist-matcher'

const prisma = new PrismaClient()

export async function getActiveWhitelistRules(options?: {
  platform?: string
  targetVersion?: string
}): Promise<WhitelistRule[]> {
  const where: Record<string, unknown> = { isActive: true }

  if (options?.platform) {
    where.OR = [{ platform: options.platform }, { platform: null }]
  }

  if (options?.targetVersion) {
    where.targetVersion = { in: [options.targetVersion] }
  }

  const rules = await prisma.upgradeWhitelist.findMany({
    where,
    select: { ruleType: true, ruleValue: true },
  })

  return rules as WhitelistRule[]
}

export async function addWhitelistRule(
  ruleType: RuleType,
  ruleValue: string,
  options?: {
    targetVersion?: string
    platform?: string
    sourceStrategyId?: number
  }
) {
  return prisma.upgradeWhitelist.create({
    data: {
      ruleType,
      ruleValue,
      targetVersion: options?.targetVersion ?? null,
      platform: options?.platform ?? null,
      sourceStrategyId: options?.sourceStrategyId ?? null,
    },
  })
}

export async function removeWhitelistRule(id: number) {
  return prisma.upgradeWhitelist.delete({ where: { id } })
}

export async function removeWhitelistRulesByStrategyId(strategyId: number) {
  return prisma.upgradeWhitelist.deleteMany({
    where: { sourceStrategyId: strategyId },
  })
}

export async function updateWhitelistRuleStatus(id: number, isActive: boolean) {
  return prisma.upgradeWhitelist.update({
    where: { id },
    data: { isActive },
  })
}

export async function listWhitelistRules(params: {
  page: number
  pageSize: number
  platform?: string
  targetVersion?: string
}) {
  const where: Record<string, unknown> = {}

  if (params.platform) {
    where.platform = params.platform
  }
  if (params.targetVersion) {
    where.targetVersion = params.targetVersion
  }

  const [total, rules] = await Promise.all([
    prisma.upgradeWhitelist.count({ where }),
    prisma.upgradeWhitelist.findMany({
      where,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return { total, rules }
}