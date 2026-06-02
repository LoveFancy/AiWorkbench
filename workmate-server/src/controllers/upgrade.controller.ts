import { Request, Response, NextFunction } from 'express'
import { checkUpgrade, createRelease, rollbackRelease, listReleases } from '../services/upgrade.service'
import { sendSuccess, sendError } from '../utils/response'
import { upgradeCheckSchema, upgradeReleaseSchema } from '../utils/validator'
import { AppError } from '../middleware/error-handler'
import { logger } from '../utils/logger'

export async function checkUpgradeHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = upgradeCheckSchema.parse(req.query)
    const jobId = req.jobId!
    const result = await checkUpgrade(parsed, jobId)
    sendSuccess(res, result)
  } catch (error) {
    next(error)
  }
}

export async function createReleaseHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = upgradeReleaseSchema.parse(req.body)
    const result = await createRelease(parsed)
    sendSuccess(res, result, '发布版本创建成功')
  } catch (error) {
    next(error)
  }
}

export async function rollbackReleaseHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { platform, targetVersion } = req.body
    if (!platform || !targetVersion) {
      throw new AppError(400, 'platform 和 targetVersion 不能为空')
    }
    const result = await rollbackRelease(platform, targetVersion)
    sendSuccess(res, result, '回退成功')
  } catch (error) {
    next(error)
  }
}

export async function listReleasesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1
    const pageSize = parseInt(req.query.pageSize as string) || 20
    const platform = req.query.platform as string | undefined
    const result = await listReleases({ page, pageSize, platform })
    sendSuccess(res, result)
  } catch (error) {
    next(error)
  }
}