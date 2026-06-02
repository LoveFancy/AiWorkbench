import { Request, Response, NextFunction } from 'express'
import {
  addAdminWhitelistRule,
  removeAdminWhitelistRule,
  updateAdminWhitelistStatus,
  listAdminWhitelistRules,
  getDashboardStats,
} from '../services/admin.service'
import {
  addWhitelistRule,
  removeWhitelistRule,
  updateWhitelistRuleStatus,
  listWhitelistRules,
} from '../services/whitelist.service'
import {
  createStrategy,
  activateStrategy,
  advanceStrategyStage,
  pauseStrategy,
  resumeStrategy,
  finishStrategy,
  listStrategies,
  getStrategyDetail,
} from '../services/strategy.service'
import { sendSuccess, sendError } from '../utils/response'
import {
  adminWhitelistRuleSchema,
  whitelistRuleSchema,
  strategyCreateSchema,
  paginationSchema,
} from '../utils/validator'
import { AppError } from '../middleware/error-handler'
import { logger } from '../utils/logger'

// ===== Dashboard =====

export async function dashboardHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getDashboardStats()
    sendSuccess(res, stats)
  } catch (error) {
    next(error)
  }
}

// ===== 管理台白名单 =====

export async function addAdminWhitelistHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = adminWhitelistRuleSchema.parse(req.body)
    const rule = await addAdminWhitelistRule(parsed.ruleType, parsed.ruleValue, parsed.remark)
    sendSuccess(res, rule, '添加成功')
  } catch (error) {
    next(error)
  }
}

export async function removeAdminWhitelistHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw new AppError(400, '无效的ID')
    await removeAdminWhitelistRule(id)
    sendSuccess(res, null, '删除成功')
  } catch (error) {
    next(error)
  }
}

export async function toggleAdminWhitelistHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw new AppError(400, '无效的ID')
    const { isActive } = req.body
    const rule = await updateAdminWhitelistStatus(id, isActive)
    sendSuccess(res, rule, '更新成功')
  } catch (error) {
    next(error)
  }
}

export async function listAdminWhitelistHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, pageSize } = paginationSchema.parse(req.query)
    const result = await listAdminWhitelistRules({ page, pageSize })
    sendSuccess(res, result)
  } catch (error) {
    next(error)
  }
}

// ===== 升级白名单 =====

export async function addUpgradeWhitelistHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = whitelistRuleSchema.parse(req.body)
    const rule = await addWhitelistRule(parsed.ruleType, parsed.ruleValue, {
      targetVersion: parsed.targetVersion,
      platform: parsed.platform,
    })
    sendSuccess(res, rule, '添加成功')
  } catch (error) {
    next(error)
  }
}

export async function removeUpgradeWhitelistHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw new AppError(400, '无效的ID')
    await removeWhitelistRule(id)
    sendSuccess(res, null, '删除成功')
  } catch (error) {
    next(error)
  }
}

export async function toggleUpgradeWhitelistHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw new AppError(400, '无效的ID')
    const { isActive } = req.body
    const rule = await updateWhitelistRuleStatus(id, isActive)
    sendSuccess(res, rule, '更新成功')
  } catch (error) {
    next(error)
  }
}

export async function listUpgradeWhitelistHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, pageSize } = paginationSchema.parse(req.query)
    const platform = req.query.platform as string | undefined
    const targetVersion = req.query.targetVersion as string | undefined
    const result = await listWhitelistRules({ page, pageSize, platform, targetVersion })
    sendSuccess(res, result)
  } catch (error) {
    next(error)
  }
}

// ===== 升级策略 =====

export async function createStrategyHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = strategyCreateSchema.parse(req.body)
    const strategy = await createStrategy(parsed)
    sendSuccess(res, strategy, '策略创建成功')
  } catch (error) {
    next(error)
  }
}

export async function activateStrategyHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw new AppError(400, '无效的策略ID')
    const strategy = await activateStrategy(id)
    sendSuccess(res, strategy, '策略已激活')
  } catch (error) {
    next(error)
  }
}

export async function advanceStrategyStageHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw new AppError(400, '无效的策略ID')
    const stage = await advanceStrategyStage(id)
    sendSuccess(res, stage, '阶段推进成功')
  } catch (error) {
    next(error)
  }
}

export async function pauseStrategyHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw new AppError(400, '无效的策略ID')
    const strategy = await pauseStrategy(id)
    sendSuccess(res, strategy, '策略已暂停')
  } catch (error) {
    next(error)
  }
}

export async function resumeStrategyHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw new AppError(400, '无效的策略ID')
    const strategy = await resumeStrategy(id)
    sendSuccess(res, strategy, '策略已恢复')
  } catch (error) {
    next(error)
  }
}

export async function finishStrategyHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw new AppError(400, '无效的策略ID')
    const strategy = await finishStrategy(id)
    sendSuccess(res, strategy, '策略已完成')
  } catch (error) {
    next(error)
  }
}

export async function listStrategiesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, pageSize } = paginationSchema.parse(req.query)
    const result = await listStrategies({ page, pageSize })
    sendSuccess(res, result)
  } catch (error) {
    next(error)
  }
}

export async function getStrategyDetailHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) throw new AppError(400, '无效的策略ID')
    const strategy = await getStrategyDetail(id)
    if (!strategy) throw new AppError(404, '策略不存在')
    sendSuccess(res, strategy)
  } catch (error) {
    next(error)
  }
}