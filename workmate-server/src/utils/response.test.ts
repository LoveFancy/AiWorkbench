import { describe, it, expect } from 'vitest'
import { sendSuccess, sendError, sendPaginated } from '../utils/response'
import type { Response } from 'express'

function createMockRes() {
  const res: Partial<Response> = {
    statusCode: 200,
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  }
  res.status = vi.fn().mockImplementation((code: number) => {
    (res as Record<string, unknown>).statusCode = code
    return res
  })
  return res as Response
}

describe('sendSuccess', () => {
  it('应返回成功响应', () => {
    const res = createMockRes()
    sendSuccess(res, { name: 'test' })
    expect(res.json).toHaveBeenCalledWith({
      code: 0,
      message: 'ok',
      data: { name: 'test' },
      timestamp: expect.any(Number),
    })
  })

  it('应支持自定义消息', () => {
    const res = createMockRes()
    sendSuccess(res, null, '操作成功')
    expect(res.json).toHaveBeenCalledWith({
      code: 0,
      message: '操作成功',
      data: null,
      timestamp: expect.any(Number),
    })
  })

  it('应支持无数据', () => {
    const res = createMockRes()
    sendSuccess(res)
    expect(res.json).toHaveBeenCalledWith({
      code: 0,
      message: 'ok',
      data: undefined,
      timestamp: expect.any(Number),
    })
  })
})

describe('sendError', () => {
  it('应返回错误响应', () => {
    const res = createMockRes()
    sendError(res, 400, '参数错误')
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      code: 400,
      message: '参数错误',
      timestamp: expect.any(Number),
    })
  })

  it('应支持自定义 code', () => {
    const res = createMockRes()
    sendError(res, 400, '参数错误', 10001)
    expect(res.json).toHaveBeenCalledWith({
      code: 10001,
      message: '参数错误',
      timestamp: expect.any(Number),
    })
  })
})

describe('sendPaginated', () => {
  it('应返回分页响应', () => {
    const res = createMockRes()
    sendPaginated(res, [{ id: 1 }, { id: 2 }], { page: 1, pageSize: 10, total: 25 })
    expect(res.json).toHaveBeenCalledWith({
      code: 0,
      message: 'ok',
      data: [{ id: 1 }, { id: 2 }],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 25,
        totalPages: 3,
      },
      timestamp: expect.any(Number),
    })
  })

  it('应正确计算总页数（整除情况）', () => {
    const res = createMockRes()
    sendPaginated(res, [], { page: 1, pageSize: 10, total: 30 })
    const call = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.pagination.totalPages).toBe(3)
  })
})