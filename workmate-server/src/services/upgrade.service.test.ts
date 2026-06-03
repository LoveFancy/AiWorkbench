import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { checkUpgrade } from '../services/upgrade.service'
import { createStrategy, activateStrategy, advanceStrategyStage } from '../services/strategy.service'

const prisma = new PrismaClient()

describe('upgrade.service', () => {
  beforeAll(async () => {
    await prisma.upgradeStrategyStageRule.deleteMany()
    await prisma.upgradeStrategyStage.deleteMany()
    await prisma.upgradeWhitelist.deleteMany()
    await prisma.upgradeStrategy.deleteMany()
    await prisma.upgradeRelease.deleteMany()
  })

  afterAll(async () => {
    await prisma.upgradeStrategyStageRule.deleteMany()
    await prisma.upgradeStrategyStage.deleteMany()
    await prisma.upgradeWhitelist.deleteMany()
    await prisma.upgradeStrategy.deleteMany()
    await prisma.upgradeRelease.deleteMany()
    await prisma.$disconnect()
  })

  describe('checkUpgrade', () => {
    it('无激活策略时应返回无更新', async () => {
      const result = await checkUpgrade(
        { currentVersion: '1.0.0', platform: 'win32' },
        '022480'
      )
      expect(result.hasUpdate).toBe(false)
    })

    it('有激活策略且用户在白名单中应返回有更新', async () => {
      // 创建一个包含白名单规则的升级策略
      const strategy = await createStrategy({
        name: 'v1.1.0 灰度升级',
        releaseType: 'UPGRADE',
        targetVersion: '1.1.0',
        downloadUrl: 'https://example.com/download',
        releaseNotes: '新版本',
        platform: 'win32',
        totalStages: 2,
        stages: [
          {
            name: '第一阶段',
            rules: [{ ruleType: 'list', ruleValue: '022480,021220' }],
          },
          {
            name: '全量放开',
            rules: [], // 全量阶段无白名单规则
          },
        ],
      })

      // 激活策略
      await activateStrategy(strategy.id)

      const result = await checkUpgrade(
        { currentVersion: '1.0.0', platform: 'win32' },
        '022480'
      )
      expect(result.hasUpdate).toBe(true)
      expect(result.latestVersion).toBe('1.1.0')
      expect(result.releaseType).toBe('UPGRADE')
      expect(result.downloadUrl).toBe('https://example.com/download')
    })

    it('用户不在白名单中应返回无更新', async () => {
      const result = await checkUpgrade(
        { currentVersion: '1.0.0', platform: 'win32' },
        '999999'
      )
      expect(result.hasUpdate).toBe(false)
    })

    it('当前版本不低于目标版本时应返回无更新', async () => {
      const result = await checkUpgrade(
        { currentVersion: '1.1.0', platform: 'win32' },
        '022480'
      )
      expect(result.hasUpdate).toBe(false)
    })

    it('全量阶段时所有用户均可升级', async () => {
      // 查找已激活的策略并推进到全量阶段
      const strategy = await prisma.upgradeStrategy.findFirst({
        where: { status: 'ACTIVE', platform: 'win32' },
      })
      expect(strategy).not.toBeNull()

      // 推进到全量阶段（第二阶段，无白名单规则）
      await advanceStrategyStage(strategy!.id)

      // 不在白名单中的用户也可以升级
      const result = await checkUpgrade(
        { currentVersion: '1.0.0', platform: 'win32' },
        '999999'
      )
      expect(result.hasUpdate).toBe(true)
      expect(result.latestVersion).toBe('1.1.0')
    })

    it('回退策略：当前版本高于目标版本且在白名单中应返回回退', async () => {
      // 先完成之前的策略
      const prevStrategy = await prisma.upgradeStrategy.findFirst({
        where: { status: 'ACTIVE', platform: 'win32' },
      })
      if (prevStrategy) {
        await prisma.upgradeWhitelist.deleteMany({
          where: { sourceStrategyId: prevStrategy.id },
        })
        await prisma.upgradeStrategy.update({
          where: { id: prevStrategy.id },
          data: { status: 'FINISHED' },
        })
      }

      // 创建回退策略
      const rollbackStrategy = await createStrategy({
        name: 'v0.9.0 回退',
        releaseType: 'ROLLBACK',
        targetVersion: '0.9.0',
        downloadUrl: 'https://example.com/download-rollback',
        releaseNotes: '回退到 0.9.0',
        platform: 'win32',
        totalStages: 2,
        stages: [
          {
            name: '回退第一阶段',
            rules: [{ ruleType: 'list', ruleValue: '022480,021220' }],
          },
          {
            name: '全量回退',
            rules: [],
          },
        ],
      })

      await activateStrategy(rollbackStrategy.id)

      const result = await checkUpgrade(
        { currentVersion: '1.1.0', platform: 'win32' },
        '022480'
      )
      expect(result.hasUpdate).toBe(true)
      expect(result.releaseType).toBe('ROLLBACK')
      expect(result.latestVersion).toBe('0.9.0')
      expect(result.hint).toContain('回退')
    })

    it('回退策略：用户不在白名单中不回退', async () => {
      const result = await checkUpgrade(
        { currentVersion: '1.1.0', platform: 'win32' },
        '999999'
      )
      expect(result.hasUpdate).toBe(false)
    })

    it('回退策略：当前版本不高于目标版本不回退', async () => {
      const result = await checkUpgrade(
        { currentVersion: '0.8.0', platform: 'win32' },
        '022480'
      )
      expect(result.hasUpdate).toBe(false)
    })
  })
})
