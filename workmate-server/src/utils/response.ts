import { Response } from 'express'
import type { ApiResponse, PaginatedResponse } from '../types'

export function sendSuccess<T>(res: Response, data?: T, message = 'ok'): void {
  const body: ApiResponse<T> = {
    code: 0,
    message,
    data,
    timestamp: Date.now(),
  }
  res.json(body)
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  code?: number
): void {
  res.status(statusCode).json({
    code: code ?? statusCode,
    message,
    timestamp: Date.now(),
  })
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: { page: number; pageSize: number; total: number }
): void {
  const body: PaginatedResponse<T> = {
    code: 0,
    message: 'ok',
    data,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.pageSize),
    },
    timestamp: Date.now(),
  }
  res.json(body)
}