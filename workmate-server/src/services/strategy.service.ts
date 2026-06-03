import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'

const prisma = new PrismaClient()

export interface CreateStrategyInput {
  name: string
  releaseType: 'UPGRADE' | 'ROLLBACK'
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
        releaseType: input.releaseType,
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
  const strategy = await prisma.upgradeStrategy.findUnique({
    where: { id: strategyId },
    include: { stages: { orderBy: { stageOrder: 'asc' }, include: { rules: true } } },
  })
  if (!strategy) throw new Error('策略不存在')
  if (strategy.status !== 'DRAFT') throw new Error('只有草稿状态的策略可以启动')

  // 同一平台同一时间只能有一个激活策略
  const existingActive = await prisma.upgradeStrategy.findFirst({
    where: { platform: strategy.platform, status: 'ACTIVE' },
  })
  if (existingActive) {
    throw new Error(`平台 ${strategy.platform} 已有激活策略「${existingActive.name}」（ID: ${existingActive.id}），请先完成或暂停该策略`)
  }

  const now = new Date()
  const firstStage = strategy.stages[0]

  await prisma.upgradeStrategy.update({
    where: { id: strategyId },
    data: { status: 'ACTIVE', currentStage: 1 },
  })

  if (firstStage) {
    await prisma.upgradeStrategyStage.update({
      where: { id: firstStage.id },
      data: { advancedAt: now },
    })

    const rules = firstStage.rules
    if (rules && rules.length > 0) {
      await prisma.upgradeWhitelist.createMany({
        data: rules.map(rule => ({
          sourceStrategyId: strategyId,
          ruleType: rule.ruleType,
          ruleValue: rule.ruleValue,
          targetVersion: strategy.targetVersion,
          platform: strategy.platform,
          isActive: true,
        })),
      })
    }
  }

  return prisma.upgradeStrategy.findUnique({
    where: { id: strategyId },
    include: { stages: { include: { rules: true } } },
  })
}

/**
 * 激活策略时同步写入/更新 upgrade_releases 表
 * 供其他需要从 releases 表查询的场景使用
 */
async function syncStrategyToReleases(strategyId: number) {
  const strategy = await prisma.upgradeStrategy.findUnique({
    where: { id: strategyId },
  })
  if (!strategy) return

  await prisma.$transaction(async (tx) => {
    await tx.upgradeRelease.updateMany({
      where: { platform: strategy.platform, isActive: true },
      data: { isActive: false },
    })
    await tx.upgradeRelease.create({
      data: {
        version: strategy.targetVersion,
        releaseType: strategy.releaseType as 'UPGRADE' | 'ROLLBACK',
        releaseNotes: strategy.releaseNotes ?? '',
        downloadUrl: strategy.downloadUrl,
        platform: strategy.platform,
        minVersion: strategy.minVersion,
        isActive: true,
      },
    })
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

export async function editStrategyStages(
  strategyId: number,
  stages: Array<{
    name: string
    rules: Array<{ ruleType: string; ruleValue: string }>
  }>,
  totalStages: number,
) {
  const strategy = await prisma.upgradeStrategy.findUnique({
    where: { id: strategyId },
  })
  if (!strategy) throw new Error('策略不存在')
  // 允许 DRAFT / ACTIVE / PAUSED 状态编辑
  if (strategy.status === 'FINISHED') throw new Error('已完成的策略不可编辑')

  return prisma.$transaction(async (tx) => {
    // 保留现有阶段的 advancedAt，按 stageOrder 匹配
    const existingStages = await tx.upgradeStrategyStage.findMany({
      where: { strategyId },
      orderBy: { stageOrder: 'asc' },
    })

    // 删除所有旧阶段（Cascade 会删除关联的 rules）
    await tx.upgradeStrategyStage.deleteMany({
      where: { strategyId },
    })

    // 插入新阶段（保留已有阶段的 advancedAt）
    for (let i = 0; i < stages.length; i++) {
      const stageInput = stages[i]
      const existingStage = existingStages.find(es => es.stageOrder === i + 1)
      const stage = await tx.upgradeStrategyStage.create({
        data: {
          strategyId,
          stageOrder: i + 1,
          name: stageInput.name,
          releaseNotes: null,
          advancedAt: existingStage?.advancedAt ?? null,
        },
      })

      await tx.upgradeStrategyStageRule.createMany({
        data: stageInput.rules.map(rule => ({
          stageId: stage.id,
          ruleType: rule.ruleType,
          ruleValue: rule.ruleValue,
        })),
      })
    }

    await tx.upgradeStrategy.update({
      where: { id: strategyId },
      data: { totalStages },
    })

    // 重新同步当前活跃阶段的白名单
    if (strategy.status === 'ACTIVE') {
      const currentStage = stages[strategy.currentStage - 1]
      if (currentStage && currentStage.rules.length > 0) {
        await tx.upgradeWhitelist.deleteMany({
          where: { sourceStrategyId: strategyId },
        })
        await tx.upgradeWhitelist.createMany({
          data: currentStage.rules.map(rule => ({
            sourceStrategyId: strategyId,
            ruleType: rule.ruleType,
            ruleValue: rule.ruleValue,
            targetVersion: strategy.targetVersion,
            platform: strategy.platform,
            isActive: true,
          })),
        })
      }
    }

    return tx.upgradeStrategy.findUnique({
      where: { id: strategyId },
      include: { stages: { include: { rules: true } } },
    })
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