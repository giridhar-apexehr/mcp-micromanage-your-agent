import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express'
import logger from '../utils/logger.js'
import type { HttpServerConfig } from './config.js'
import { createDatabase, destroyDatabase } from './db/index.js'
import { registerAuth } from './auth/index.js'
import { registerPatAuth } from './auth/patAuth.js'
import { registerCsrf } from './csrf/index.js'
import { registerWorkspaces } from './workspaces/register.js'
import { registerPats } from './pats/register.js'
import { registerWorkplans } from './workplans/register.js'

export const createApp = (config: HttpServerConfig): express.Express => {
  const app = express()

  app.use(express.json({ limit: '1mb' }))
  app.use(cors({ origin: config.corsOrigin, credentials: true }))

  registerAuth(app)
  registerPatAuth(app)
  registerCsrf(app)
  registerWorkspaces(app)
  registerPats(app)
  registerWorkplans(app)

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

  const serverDir = path.dirname(fileURLToPath(import.meta.url))
  const uiDir = path.resolve(serverDir, '../ui')
  const uiIndexPath = path.join(uiDir, 'index.html')

  if (fs.existsSync(uiIndexPath)) {
    app.use(express.static(uiDir, { index: false }))

    app.get('/', (_req: Request, res: Response) => {
      res.sendFile(uiIndexPath)
    })

    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') {
        next()
        return
      }

      const accept = String(req.get('accept') ?? '')
      if (!accept.includes('text/html')) {
        next()
        return
      }

      const p = req.path
      if (
        p === '/healthz' ||
        p === '/readyz' ||
        p.startsWith('/api/') ||
        p.startsWith('/auth/') ||
        p.startsWith('/csrf/') ||
        p === '/ui' ||
        p.startsWith('/ui/')
      ) {
        next()
        return
      }

      res.sendFile(uiIndexPath)
    })
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.logError('HTTP request error', err)
    res.status(500).json({ error: 'Internal Server Error' })
  })

  return app
}
