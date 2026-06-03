import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractUserId } from '../middleware/extract-user-id'
import { config } from '../config'
import type { Request, Response } from 'express'

const KEY_HEX = '0123456789abcdef0123456789abcdef'
const KEY = Buffer.from(KEY_HEX, 'hex')

function realEncryptJobId(jobId: string): string {
  const crypto = require('node:crypto')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-128-gcm', KEY, iv, { authTagLength: 16 })
  const encrypted = Buffer.concat([cipher.update(jobId, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, encrypted, authTag])
  return combined.toString('base64')
}

function createMockReqRes(headers: Record<string, string> = {}) {
  const req = {
    headers,
    jobId: undefined as string | undefined,
  } as unknown as Request

  const res = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response

  return { req, res }
}

describe('extractUserId', () => {
  beforeEach(() => {
    process.env.USER_ID_ENCRYPTION_KEY = KEY_HEX
    // 恢复默认配置
    config.requireUserId = false
    config.defaultUserId = 'test_user'
  })

  it('应成功解密工号', () => {
    const encrypted = realEncryptJobId('022480')
    const { req, res } = createMockReqRes({ 'x-eipgw-userid': encrypted })
    const next = vi.fn()

    extractUserId(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.jobId).toBe('022480')
  })

  it('校验关闭时缺少 Header 应使用默认用户', () => {
    config.requireUserId = false
    const { req, res } = createMockReqRes()
    const next = vi.fn()

    extractUserId(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.jobId).toBe('test_user')
  })

  it('校验开启时缺少 Header 应返回 403', () => {
    config.requireUserId = true
    const { req, res } = createMockReqRes()
    const next = vi.fn()

    extractUserId(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 403, message: '缺少用户身份信息' })
    )
  })

  it('校验关闭时解密失败应使用默认用户', () => {
    config.requireUserId = false
    const { req, res } = createMockReqRes({ 'x-eipgw-userid': 'invalid_base64' })
    const next = vi.fn()

    extractUserId(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.jobId).toBe('test_user')
  })

  it('校验开启时解密失败应返回 403', () => {
    config.requireUserId = true
    const { req, res } = createMockReqRes({ 'x-eipgw-userid': 'invalid_base64' })
    const next = vi.fn()

    extractUserId(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
