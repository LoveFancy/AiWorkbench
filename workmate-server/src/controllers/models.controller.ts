import { Request, Response, NextFunction } from 'express'
import { getUserCredentials } from '../services/model-platform.service'
import { sendSuccess } from '../utils/response'
import { logger } from '../utils/logger'

export async function getUserModelsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const jobId = req.jobId!
    const { apiKey, models } = await getUserCredentials(jobId)
    sendSuccess(res, { apiKey, models, total: models.length })
  } catch (error) {
    logger.error('获取模型列表失败', { error })
    next(error)
  }
}