import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app'
import { PrismaClient } from '@prisma/client'
import { createCipheriv } from 'node:crypto'
import { config } from '../config'

const prisma = new PrismaClient()

const KEY_HEX = '0123456789abcdef0123456789abcdef'
const KEY = Buffer.from(KEY_HEX, 'hex')

function encryptJobId(jobId: string): string {
  const iv = Buffer.alloc(12, 0)
  const cipher = createCipheriv('aes-128-gcm', KEY, iv, { authTagLength: 16 })
  const encrypted = Buffer.concat([cipher.update(jobId, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, encrypted, authTag])
  return combined.toString('base64')
}

function authHeader(jobId = '022480'): Record<string, string> {
  return { 'x-eipgw-userid': encryptJobId(jobId) }
}

describe('API Routes', () => {
  beforeAll(async () => {
    process.env.USER_ID_ENCRYPTION_KEY = KEY_HEX
    await prisma.adminWhitelist.deleteMany()
    await prisma.upgradeWhitelist.deleteMany()
    await prisma.upgradeRelease.deleteMany()
    await prisma.observabilityEvent.deleteMany()

    await prisma.adminWhitelist.create({
      data: { ruleType: 'list', ruleValue: '022480', remark: '测试管理员' },
    })
  })

  beforeEach(() => {
    // 默认关闭身份校验，各测试可按需开启
    config.requireUserId = false
  })

  afterAll(async () => {
    await prisma.adminWhitelist.deleteMany()
    await prisma.upgradeWhitelist.deleteMany()
    await prisma.upgradeRelease.deleteMany()
    await prisma.observabilityEvent.deleteMany()
    await prisma.$disconnect()
  })

  describe('GET /workmate/health', () => {
    it('应返回健康状态', async () => {
      const res = await request(app).get('/workmate/health')
      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
    })
  })

  describe('GET /workmate/models', () => {
    it('应在缺少认证时返回 403', async () => {
      config.requireUserId = true
      const res = await request(app).get('/workmate/models')
      expect(res.status).toBe(403)
    })
  })

  describe('GET /workmate/upgrade/check', () => {
    it('应返回无更新', async () => {
      const res = await request(app)
        .get('/workmate/upgrade/check')
        .query({ currentVersion: '1.0.0', platform: 'win32' })
        .set(authHeader())

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
      expect(res.body.data.hasUpdate).toBe(false)
    })
  })

  describe('POST /workmate/observability/events', () => {
    it('应成功上报事件', async () => {
      const res = await request(app)
        .post('/workmate/observability/events')
        .set(authHeader())
        .send({
          eventId: 'aa0e8400-e29b-41d4-a716-446655440000',
          type: 'chat_question',
          userName: '测试用户',
          timestamp: Date.now(),
          question: '测试问题',
          client: {
            appVersion: '1.0.0',
            platform: 'win32',
          },
        })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('应拒绝无效数据', async () => {
      const res = await request(app)
        .post('/workmate/observability/events')
        .set(authHeader())
        .send({
          type: 'invalid_type',
          client: {},
        })

      expect(res.status).toBe(400)
    })
  })

  describe('GET /workmate/console/dashboard', () => {
    it('管理员应能访问管理台', async () => {
      const res = await request(app)
        .get('/workmate/console/dashboard')
        .set(authHeader('022480'))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })

    it('非管理员应被拒绝', async () => {
      config.requireUserId = true
      const res = await request(app)
        .get('/workmate/console/dashboard')
        .set(authHeader('999999'))

      expect(res.status).toBe(403)
    })
  })

  describe('GET /workmate/console/admin-whitelist', () => {
    it('应返回管理员白名单列表', async () => {
      const res = await request(app)
        .get('/workmate/console/admin-whitelist')
        .set(authHeader('022480'))

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })

  describe('POST /workmate/console/admin-whitelist', () => {
    it('应添加管理员白名单', async () => {
      const res = await request(app)
        .post('/workmate/console/admin-whitelist')
        .set(authHeader('022480'))
        .send({
          ruleType: 'list',
          ruleValue: '021220',
          remark: '新增管理员',
        })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(0)
    })
  })
})