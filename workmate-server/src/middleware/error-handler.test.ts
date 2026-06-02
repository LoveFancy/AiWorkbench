import { describe, it, expect, vi } from 'vitest'
import { errorHandler, AppError } from '../middleware/error-handler'
import { ZodError, z } from 'zod'
import type { Request, Response } from 'express'

function createMockReqRes() {
  const req = {
    url: '/test',
    method: 'GET',
  } as unknown as Request

  const res = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response

  return { req, res }
}

describe('AppError', () => {
  it('应正确设置属性', () => {
    const err = new AppError(400, '参数错误')
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe(400)
    expect(err.message).toBe('参数错误')
    expect(err.name).toBe('AppError')
  })

  it('应支持自定义 code', () => {
    const err = new AppError(400, '参数错误', 10001)
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe(10001)
  })
})

describe('errorHandler', () => {
  it('应处理 AppError', () => {
    const { req, res } = createMockReqRes()
    const err = new AppError(404, '资源不存在')

    errorHandler(err, req, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({
      code: 404,
      message: '资源不存在',
      timestamp: expect.any(Number),
    })
  })

  it('应处理 ZodError', () => {
    const { req, res } = createMockReqRes()
    const schema = z.object({ name: z.string() })
    const result = schema.safeParse({ name: 123 })
    const err = (result as any).error as ZodError

    errorHandler(err, req, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 400,
        message: '参数校验失败',
        errors: expect.any(Array),
      })
    )
  })

  it('应处理未知错误', () => {
    const { req, res } = createMockReqRes()
    const err = new Error('未知错误')

    errorHandler(err, req, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      code: 500,
      message: '服务内部错误',
      timestamp: expect.any(Number),
    })
  })
})