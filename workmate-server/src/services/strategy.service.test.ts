import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import {
  createStrategy,
  activateStrategy,
  advanceStrategyStage,
  pauseStrategy,
  finishStrategy,
  listStrategies,
  getStrategyDetail,
} from '../services/strategy.service'

const prisma = new PrismaClient()

describe('strategy.service', () => {
  let strategyId = 0

  beforeAll(async () => {
    await prisma.upgradeStrategyStageRule.deleteMany()
    await prisma.upgradeStrategyStage.deleteMany()
    await prisma.upgradeWhitelist.deleteMany()
    await prisma.upgradeStrategy.deleteMany()
  })

  afterAll(async () => {
    await prisma.upgradeStrategyStageRule.deleteMany()
    await prisma.upgradeStrategyStage.deleteMany()
    await prisma.upgradeWhitelist.deleteMany()
    await prisma.upgradeStrategy.deleteMany()
    await prisma.$disconnect()
  })

  describe('createStrategy', () => {
    it('应成功创建策略', async () => {
      const strategy = await createStrategy({
        name: 'v1.0.0 灰度升级',
        targetVersion: '1.0.0',
        downloadUrl: 'https://example.com/download',
        releaseNotes: '测试策略',
        platform: 'win32',
        totalStages: 3,
        stages: [
          {
            name: '阶段1',
            rules: [{ ruleType: 'list', ruleValue: '022480' }],
          },
          {
            name: '阶段2',
            rules: [{ ruleType: 'prefix', ruleValue: '022*' }],
          },
          {
            name: '阶段3',
            rules: [{ ruleType: 'suffix', ruleValue: '*022' }],
          },
        ],
      })

      expect(strategy.id).toBeGreaterThan(0)
      expect(strategy.name).toBe('v1.0.0 灰度升级')
      expect(strategy.totalStages).toBe(3)
      expect(strategy.currentStage).toBe(0)
      expect(strategy.status).toBe('DRAFT')

      strategyId = strategy.id
    })

    it('应创建阶段和规则', async () => {
      const detail = await getStrategyDetail(strategyId)
      expect(detail).not.toBeNull()
      expect(detail!.stages).toHaveLength(3)
      expect(detail!.stages[0].name).toBe('阶段1')
      expect(detail!.stages[0].rules).toHaveLength(1)
      expect(detail!.stages[0].rules[0].ruleType).toBe('list')
    })
  })

  describe('activateStrategy', () => {
    it('应激活草稿策略并同步第一阶段规则', async () => {
      const strategy = await activateStrategy(strategyId)
      expect(strategy.status).toBe('ACTIVE')
      expect(strategy.currentStage).toBe(1)

      // 激活时同步了 Stage 1 的规则
      const rules = await prisma.upgradeWhitelist.findMany({
        where: { sourceStrategyId: strategyId },
      })
      expect(rules.length).toBe(1)
    })

    it('不应激活非草稿策略', async () => {
      await expect(activateStrategy(strategyId)).rejects.toThrow('只有草稿状态的策略可以启动')
    })
  })

  describe('advanceStrategyStage', () => {
    it('推进到第二阶段应累加白名单规则', async () => {
      const stage = await advanceStrategyStage(strategyId)
      expect(stage.stageOrder).toBe(2)

      const rules = await prisma.upgradeWhitelist.findMany({
        where: { sourceStrategyId: strategyId },
      })
      expect(rules.length).toBe(2)
    })

    it('推进到第三阶段应累加所有规则', async () => {
      const stage = await advanceStrategyStage(strategyId)
      expect(stage.stageOrder).toBe(3)

      const rules = await prisma.upgradeWhitelist.findMany({
        where: { sourceStrategyId: strategyId },
      })
      expect(rules.length).toBe(3)
    })

    it('不应推进超出最终阶段', async () => {
      await expect(advanceStrategyStage(strategyId)).rejects.toThrow('已到达最终阶段')
    })
  })

  describe('pauseStrategy', () => {
    it('应暂停策略并清理白名单', async () => {
      const strategy = await pauseStrategy(strategyId)
      expect(strategy.status).toBe('PAUSED')

      const rules = await prisma.upgradeWhitelist.findMany({
        where: { sourceStrategyId: strategyId },
      })
      expect(rules.length).toBe(0)
    })
  })

  describe('finishStrategy', () => {
    it('应完成策略', async () => {
      const strategy = await finishStrategy(strategyId)
      expect(strategy.status).toBe('FINISHED')
    })
  })

  describe('listStrategies', () => {
    it('应返回策略列表', async () => {
      const result = await listStrategies({ page: 1, pageSize: 20 })
      expect(result.total).toBeGreaterThanOrEqual(1)
    })
  })
})