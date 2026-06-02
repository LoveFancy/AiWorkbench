import { PrismaClient } from '@prisma/client'
import type { RuleType } from '../types'

const prisma = new PrismaClient()

export async function addAdminWhitelistRule(
  ruleType: RuleType,
  ruleValue: string,
  remark?: string
) {
  return prisma.adminWhitelist.create({
    data: { ruleType, ruleValue, remark: remark ?? null },
  })
}

export async function removeAdminWhitelistRule(id: number) {
  return prisma.adminWhitelist.delete({ where: { id } })
}

export async function updateAdminWhitelistStatus(id: number, isActive: boolean) {
  return prisma.adminWhitelist.update({
    where: { id },
    data: { isActive },
  })
}

export async function listAdminWhitelistRules(params: {
  page: number
  pageSize: number
}) {
  const [total, rules] = await Promise.all([
    prisma.adminWhitelist.count(),
    prisma.adminWhitelist.findMany({
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return { total, rules }
}

export async function getDashboardStats() {
  const [
    totalEvents,
    errorEvents,
    activeStrategies,
    activeReleases,
    totalUsers,
  ] = await Promise.all([
    prisma.observabilityEvent.count(),
    prisma.observabilityEvent.count({ where: { eventType: 'error' } }),
    prisma.upgradeStrategy.count({ where: { status: 'ACTIVE' } }),
    prisma.upgradeRelease.count({ where: { isActive: true } }),
    prisma.observabilityEvent
      .findMany({
        select: { userId: true },
        distinct: ['userId'],
      })
      .then((users) => users.length),
  ])

  return {
    totalEvents,
    errorEvents,
    errorRate: totalEvents > 0 ? errorEvents / totalEvents : 0,
    activeStrategies,
    activeReleases,
    totalUsers,
  }
}