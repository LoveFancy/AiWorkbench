import { Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { matchAnyRule } from '../utils/whitelist-matcher'
import { logger } from '../utils/logger'
import { config } from '../config'

const prisma = new PrismaClient()

let cachedRules: { ruleType: string; ruleValue: string }[] = []
let lastCacheTime = 0
const CACHE_TTL_MS = 60_000

async function getAdminWhitelistRules() {
  const now = Date.now()
  if (now - lastCacheTime < CACHE_TTL_MS && cachedRules.length > 0) {
    return cachedRules
  }

  const rules = await prisma.adminWhitelist.findMany({
    where: { isActive: true },
    select: { ruleType: true, ruleValue: true },
  })

  cachedRules = rules.map((r) => ({
    ruleType: r.ruleType,
    ruleValue: r.ruleValue,
  }))
  lastCacheTime = now

  return cachedRules
}

export function adminWhitelistGuard() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const jobId = req.jobId

    if (!config.requireUserId) {
      next()
      return
    }

    if (!jobId) {
      res.status(403).json({ code: 403, message: '缺少用户身份信息', timestamp: Date.now() })
      return
    }

    try {
      const rules = await getAdminWhitelistRules()

      if (rules.length === 0) {
        res.status(403).json({ code: 403, message: '未配置管理员白名单', timestamp: Date.now() })
        return
      }

      if (matchAnyRule(jobId, rules)) {
        next()
      } else {
        logger.warn('非管理员用户尝试访问管理台', { jobId })
        res.status(403).json({ code: 403, message: '无权限访问管理后台', timestamp: Date.now() })
      }
    } catch (error) {
      logger.error('管理台白名单校验失败', { error })
      res.status(500).json({ code: 500, message: '服务内部错误', timestamp: Date.now() })
    }
  }
}