import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { extractUserId } from './middleware/extract-user-id'
import { adminWhitelistGuard } from './middleware/admin-whitelist'
import { errorHandler } from './middleware/error-handler'
import { requestLogger } from './middleware/request-logger'
import { generalLimiter, observabilityLimiter, adminLimiter } from './middleware/rate-limiter'
import routes from './routes'
import adminRoutes from './routes/admin.routes'

const app = express()

app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use(requestLogger)

// 服务端公开接口 - /workmate
app.use('/workmate', generalLimiter, extractUserId)
app.use('/workmate', routes)

// 管理台接口 - /workmate-console
app.use('/workmate-console', adminLimiter, extractUserId)
app.use('/workmate-console', adminWhitelistGuard())
app.use('/workmate-console', adminRoutes)

// 健康检查（无需认证）
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

app.use(errorHandler)

export default app