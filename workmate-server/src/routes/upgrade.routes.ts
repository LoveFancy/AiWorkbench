import { Router } from 'express'
import { checkUpgradeHandler } from '../controllers/upgrade.controller'

const router = Router()

router.get('/check', checkUpgradeHandler)

export default router