import { Router } from 'express'
import { reportEventHandler } from '../controllers/observability.controller'

const router = Router()

router.post('/events', reportEventHandler)

export default router