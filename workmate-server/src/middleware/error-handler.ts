import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'
import { ZodError } from 'zod'

export class AppError extends Error {
  statusCode: number
  code: number

  constructor(statusCode: number, message: string, code?: number) {
    super(message)
    this.statusCode = statusCode
    this.code = code ?? statusCode
    this.name = 'AppError'
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      timestamp: Date.now(),
    })
    return
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      code: 400,
      message: '参数校验失败',
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
      timestamp: Date.now(),
    })
    return
  }

  logger.error('未捕获的错误', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  })

  res.status(500).json({
    code: 500,
    message: '服务内部错误',
    timestamp: Date.now(),
  })
}