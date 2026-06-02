import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { checkUpgrade, createRelease, rollbackRelease } from '../services/upgrade.service'
import { addWhitelistRule } from '../services/whitelist.service'

const prisma = new PrismaClient()

describe('upgrade.service', () => {
  beforeAll(async () => {
    await prisma.upgradeWhitelist.deleteMany()
    await prisma.upgradeRelease.deleteMany()
  })

  afterAll(async () => {
    await prisma.upgradeWhitelist.deleteMany()
    await prisma.upgradeRelease.deleteMany()
    await prisma.$disconnect()
  })

  describe('checkUpgrade', () => {
    it('无活跃版本时应返回无更新', async () => {
      const result = await checkUpgrade(
        { currentVersion: '1.0.0', platform: 'win32' },
        '022480'
      )
      expect(result.hasUpdate).toBe(false)
    })

    it('用户在白名单中应返回有更新', async () => {
      await createRelease({
        version: '1.1.0',
        releaseType: 'UPGRADE',
        releaseNotes: '新版本',
        downloadUrl: 'https://example.com/download',
        platform: 'win32',
      })

      await addWhitelistRule('list', '022480', {
        targetVersion: '1.1.0',
        platform: 'win32',
      })

      const result = await checkUpgrade(
        { currentVersion: '1.0.0', platform: 'win32' },
        '022480'
      )
      expect(result.hasUpdate).toBe(true)
      expect(result.latestVersion).toBe('1.1.0')
      expect(result.releaseType).toBe('UPGRADE')
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

    it('回退版本：当前版本高于目标版本且在白名单中应返回有更新', async () => {
      await addWhitelistRule('list', '022480', {
        targetVersion: '0.9.0',
        platform: 'win32',
      })

      await createRelease({
        version: '0.9.0',
        releaseType: 'ROLLBACK',
        releaseNotes: '回退到 0.9.0',
        downloadUrl: 'https://example.com/download',
        platform: 'win32',
      })

      const result = await checkUpgrade(
        { currentVersion: '1.1.0', platform: 'win32' },
        '022480'
      )
      expect(result.hasUpdate).toBe(true)
      expect(result.releaseType).toBe('ROLLBACK')
      expect(result.latestVersion).toBe('0.9.0')
    })
  })

  describe('createRelease', () => {
    it('应创建新版本并将旧版本设为非活跃', async () => {
      const release = await createRelease({
        version: '1.2.0',
        releaseType: 'UPGRADE',
        releaseNotes: '最新版本',
        downloadUrl: 'https://example.com/download',
        platform: 'win32',
      })

      expect(release.version).toBe('1.2.0')
      expect(release.isActive).toBe(true)

      const oldRelease = await prisma.upgradeRelease.findFirst({
        where: { platform: 'win32', version: '1.1.0' },
      })
      expect(oldRelease?.isActive).toBe(false)
    })
  })

  describe('rollbackRelease', () => {
    it('应回退到指定版本', async () => {
      const result = await rollbackRelease('win32', '0.9.0')
      expect(result.isActive).toBe(true)
      expect(result.version).toBe('0.9.0')
    })
  })
})