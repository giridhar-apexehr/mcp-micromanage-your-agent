import cors from 'cors'
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express'
import logger from '../utils/logger.js'
import type { HttpServerConfig } from './config.js'
import { createDatabase, destroyDatabase } from './db/index.js'
import { registerAuth } from './auth/index.js'
import { registerCsrf } from './csrf/index.js'

export const createApp = (config: HttpServerConfig): express.Express => {
  const app = express()

  app.use(express.json({ limit: '1mb' }))
  app.use(cors({ origin: config.corsOrigin, credentials: true }))

  registerAuth(app)
  registerCsrf(app)

  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' })
  })

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' })
  })

  app.get('/readyz', async (_req: Request, res: Response) => {
    try {
      const handle = createDatabase()
      try {
        await handle.db.selectFrom('users').select(['id']).limit(1).execute()
      } finally {
        await destroyDatabase(handle)
      }

      res.status(200).json({ status: 'ok' })
    } catch (error) {
      logger.logError('Readiness check failed', error)
      res.status(503).json({ status: 'not_ready' })
    }
  })

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.logError('HTTP request error', err)
    res.status(500).json({ error: 'Internal Server Error' })
  })

  return app
}
