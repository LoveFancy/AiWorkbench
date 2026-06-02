import { Request, Response, NextFunction } from 'express'
import { getUserModels } from '../services/model-platform.service'
import { sendSuccess, sendError } from '../utils/response'
import { logger } from '../utils/logger'

export async function getUserModelsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const jobId = req.jobId!
    const models = await getUserModels(jobId)
    sendSuccess(res, { models, total: models.length })
  } catch (error) {
    logger.error('获取模型列表失败', { error })
    next(error)
  }
}