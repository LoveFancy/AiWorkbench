import { Router } from 'express'
import { getUserModelsHandler } from '../controllers/models.controller'

const router = Router()

router.get('/', getUserModelsHandler)

export default router