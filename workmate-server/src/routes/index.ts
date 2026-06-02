import { Router } from 'express'
import modelsRoutes from './models.routes'
import upgradeRoutes from './upgrade.routes'
import observabilityRoutes from './observability.routes'
import adminRoutes from './admin.routes'

const router = Router()

router.use('/models', modelsRoutes)
router.use('/upgrade', upgradeRoutes)
router.use('/observability', observabilityRoutes)

export default router