import { Router } from 'express'
import {
  dashboardHandler,
  addAdminWhitelistHandler,
  removeAdminWhitelistHandler,
  toggleAdminWhitelistHandler,
  listAdminWhitelistHandler,
  addUpgradeWhitelistHandler,
  removeUpgradeWhitelistHandler,
  toggleUpgradeWhitelistHandler,
  listUpgradeWhitelistHandler,
  createStrategyHandler,
  activateStrategyHandler,
  advanceStrategyStageHandler,
  pauseStrategyHandler,
  resumeStrategyHandler,
  finishStrategyHandler,
  listStrategiesHandler,
  getStrategyDetailHandler,
} from '../controllers/admin.controller'
import {
  createReleaseHandler,
  rollbackReleaseHandler,
  listReleasesHandler,
} from '../controllers/upgrade.controller'
import { queryEventsHandler, getEventStatsHandler } from '../controllers/observability.controller'

const router = Router()

router.get('/dashboard', dashboardHandler)

// 管理台白名单
router.get('/admin-whitelist', listAdminWhitelistHandler)
router.post('/admin-whitelist', addAdminWhitelistHandler)
router.delete('/admin-whitelist/:id', removeAdminWhitelistHandler)
router.patch('/admin-whitelist/:id', toggleAdminWhitelistHandler)

// 升级白名单
router.get('/upgrade-whitelist', listUpgradeWhitelistHandler)
router.post('/upgrade-whitelist', addUpgradeWhitelistHandler)
router.delete('/upgrade-whitelist/:id', removeUpgradeWhitelistHandler)
router.patch('/upgrade-whitelist/:id', toggleUpgradeWhitelistHandler)

// 升级发布
router.get('/releases', listReleasesHandler)
router.post('/releases', createReleaseHandler)
router.post('/rollback', rollbackReleaseHandler)

// 升级策略
router.get('/strategies', listStrategiesHandler)
router.post('/strategies', createStrategyHandler)
router.get('/strategies/:id', getStrategyDetailHandler)
router.post('/strategies/:id/activate', activateStrategyHandler)
router.post('/strategies/:id/advance-stage', advanceStrategyStageHandler)
router.post('/strategies/:id/pause', pauseStrategyHandler)
router.post('/strategies/:id/resume', resumeStrategyHandler)
router.post('/strategies/:id/finish', finishStrategyHandler)

// 观测数据
router.get('/observability/events', queryEventsHandler)
router.get('/observability/stats', getEventStatsHandler)

export default router