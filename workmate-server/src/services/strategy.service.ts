import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'

const prisma = new PrismaClient()

export interface CreateStrategyInput {
  name: string
  targetVersion: string
  downloadUrl: string
  releaseNotes?: string
  platform: string
  minVersion?: string
  totalStages: number
  soakTimeMinutes?: number
  autoPauseErrorRate?: number
  autoPauseEnabled?: boolean
  stages: Array<{
    name: string
    releaseNotes?: string
    rules: Array<{
      ruleType: string
      ruleValue: string
    }>
  }>
}

export async function createStrategy(input: CreateStrategyInput) {
  const strategy = await prisma.$transaction(async (tx) => {
    const st = await tx.upgradeStrategy.create({
      data: {
        name: input.name,
        targetVersion: input.targetVersion,
        downloadUrl: input.downloadUrl,
        releaseNotes: input.releaseNotes ?? null,
        platform: input.platform,
        minVersion: input.minVersion ?? null,
        totalStages: input.totalStages,
        soakTimeMinutes: input.soakTimeMinutes ?? null,
        autoPauseErrorRate: input.autoPauseErrorRate ?? null,
        autoPauseEnabled: input.autoPauseEnabled ?? false,
      },
    })

    for (let i = 0; i < input.stages.length; i++) {
      const stageInput = input.stages[i]
      const stage = await tx.upgradeStrategyStage.create({
        data: {
          strategyId: st.id,
          stageOrder: i + 1,
          name: stageInput.name,
          releaseNotes: stageInput.releaseNotes ?? null,
        },
      })

      await tx.upgradeStrategyStageRule.createMany({
        data: stageInput.rules.map((rule) => ({
          stageId: stage.id,
          ruleType: rule.ruleType,
          ruleValue: rule.ruleValue,
        })),
      })
    }

    return st
  })

  return strategy
}

export async function activateStrategy(strategyId: number) {
  const strategy = await prisma.upgradeStrategy.findUnique({ where: { id: strategyId } })
  if (!strategy) throw new Error('策略不存在')
  if (strategy.status !== 'DRAFT') throw new Error('只有草稿状态的策略可以启动')

  return prisma.upgradeStrategy.update({
    where: { id: strategyId },
    data: { status: 'ACTIVE' },
  })
}

export async function advanceStrategyStage(strategyId: number) {
  const strategy = await prisma.upgradeStrategy.findUnique({
    where: { id: strategyId },
    include: { stages: { include: { rules: true }, orderBy: { stageOrder: 'asc' } } },
  })

  if (!strategy) throw new Error('策略不存在')
  if (strategy.status !== 'ACTIVE') throw new Error('只有进行中的策略可以推进')

  const nextStage = strategy.stages.find(
    (s) => s.stageOrder === strategy.currentStage + 1
  )
  if (!nextStage) throw new Error('已到达最终阶段')

  const now = new Date()

  const currentStage = strategy.stages.find(
    (s) => s.stageOrder === strategy.currentStage
  )

  if (currentStage?.advancedAt && strategy.soakTimeMinutes) {
    const elapsed = (now.getTime() - currentStage.advancedAt.getTime()) / 60000
    if (elapsed < strategy.soakTimeMinutes) {
      throw new Error(
        `浸泡时间不足，还需等待 ${Math.ceil(strategy.soakTimeMinutes - elapsed)} 分钟`
      )
    }
  }

  if (strategy.autoPauseEnabled && strategy.autoPauseErrorRate) {
    const errorCount = await getStageErrorCount(
      strategy.platform,
      strategy.targetVersion,
      currentStage?.advancedAt ?? undefined
    )
    const totalRequests = await getStageRequestCount(
      strategy.platform,
      strategy.targetVersion,
      currentStage?.advancedAt ?? undefined
    )

    if (totalRequests > 10) {
      const errorRate = errorCount / totalRequests
      if (errorRate > Number(strategy.autoPauseErrorRate)) {
        await prisma.upgradeStrategy.update({
          where: { id: strategyId },
          data: { status: 'PAUSED' },
        })
        throw new Error(
          `错误率 ${(errorRate * 100).toFixed(1)}% 超过阈值 ${(Number(strategy.autoPauseErrorRate) * 100).toFixed(1)}%，策略已自动暂停`
        )
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const allRules = strategy.stages
      .filter((s) => s.stageOrder <= nextStage.stageOrder)
      .flatMap((s) => s.rules)

    await tx.upgradeWhitelist.deleteMany({
      where: { sourceStrategyId: strategyId },
    })

    if (allRules.length > 0) {
      await tx.upgradeWhitelist.createMany({
        data: allRules.map((rule) => ({
          sourceStrategyId: strategyId,
          ruleType: rule.ruleType,
          ruleValue: rule.ruleValue,
          targetVersion: strategy.targetVersion,
          platform: strategy.platform,
          isActive: true,
        })),
      })
    }

    await tx.upgradeStrategyStage.update({
      where: { id: nextStage.id },
      data: { advancedAt: now },
    })

    await tx.upgradeStrategy.update({
      where: { id: strategyId },
      data: { currentStage: nextStage.stageOrder },
    })

    return nextStage
  })

  return result
}

async function getStageErrorCount(
  platform: string,
  targetVersion: string,
  since?: Date
): Promise<number> {
  return prisma.observabilityEvent.count({
    where: {
      eventType: 'error',
      clientPlatform: platform,
      clientVersion: targetVersion,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
  })
}

async function getStageRequestCount(
  platform: string,
  targetVersion: string,
  since?: Date
): Promise<number> {
  return prisma.observabilityEvent.count({
    where: {
      eventType: { in: ['chat_question', 'agent_question'] },
      clientPlatform: platform,
      clientVersion: targetVersion,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
  })
}

export async function pauseStrategy(strategyId: number) {
  const strategy = await prisma.upgradeStrategy.findUnique({ where: { id: strategyId } })
  if (!strategy) throw new Error('策略不存在')
  if (strategy.status !== 'ACTIVE') throw new Error('只有进行中的策略可以暂停')

  await prisma.upgradeWhitelist.deleteMany({
    where: { sourceStrategyId: strategyId },
  })

  return prisma.upgradeStrategy.update({
    where: { id: strategyId },
    data: { status: 'PAUSED' },
  })
}

export async function resumeStrategy(strategyId: number) {
  const strategy = await prisma.upgradeStrategy.findUnique({
    where: { id: strategyId },
    include: {
      stages: { include: { rules: true }, orderBy: { stageOrder: 'asc' } },
    },
  })

  if (!strategy) throw new Error('策略不存在')
  if (strategy.status !== 'PAUSED') throw new Error('只有已暂停的策略可以恢复')

  const allRules = strategy.stages
    .filter((s) => s.stageOrder <= strategy.currentStage)
    .flatMap((s) => s.rules)

  await prisma.$transaction(async (tx) => {
    await tx.upgradeWhitelist.deleteMany({
      where: { sourceStrategyId: strategyId },
    })

    if (allRules.length > 0) {
      await tx.upgradeWhitelist.createMany({
        data: allRules.map((rule) => ({
          sourceStrategyId: strategyId,
          ruleType: rule.ruleType,
          ruleValue: rule.ruleValue,
          targetVersion: strategy.targetVersion,
          platform: strategy.platform,
          isActive: true,
        })),
      })
    }

    await tx.upgradeStrategy.update({
      where: { id: strategyId },
      data: { status: 'ACTIVE' },
    })
  })

  return strategy
}

export async function finishStrategy(strategyId: number) {
  const strategy = await prisma.upgradeStrategy.findUnique({ where: { id: strategyId } })
  if (!strategy) throw new Error('策略不存在')

  await prisma.upgradeWhitelist.deleteMany({
    where: { sourceStrategyId: strategyId },
  })

  return prisma.upgradeStrategy.update({
    where: { id: strategyId },
    data: { status: 'FINISHED' },
  })
}

export async function listStrategies(params: { page: number; pageSize: number }) {
  const [total, strategies] = await Promise.all([
    prisma.upgradeStrategy.count(),
    prisma.upgradeStrategy.findMany({
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { stages: true } },
      },
    }),
  ])

  return { total, strategies }
}

export async function getStrategyDetail(strategyId: number) {
  return prisma.upgradeStrategy.findUnique({
    where: { id: strategyId },
    include: {
      stages: {
        orderBy: { stageOrder: 'asc' },
        include: { rules: true },
      },
    },
  })
}