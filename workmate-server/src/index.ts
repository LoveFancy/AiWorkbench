import { config } from './config'
import { logger } from './utils/logger'
import app from './app'

const { port, host } = config

app.listen(port, host, () => {
  logger.info(`WorkMate Server 已启动`, {
    host,
    port,
    env: process.env.NODE_ENV ?? 'development',
    endpoints: {
      client: `http://${host}:${port}/workmate`,
      console: `http://${host}:${port}/workmate-console`,
      health: `http://${host}:${port}/health`,
    },
  })
})