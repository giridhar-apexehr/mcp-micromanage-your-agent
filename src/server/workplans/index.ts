import { Router } from 'express'

import { enforcePatWorkspaceScope } from './authz.js'
import { registerWorkplanImportExportRoutes } from './routesImportExport.js'
import { registerWorkplanMeRoutes } from './routesMe.js'
import { registerWorkplanCrudRoutes } from './routesCrud.js'
import { registerWorkplanToolRoutes } from './routesTools.js'

export const createWorkplansRouter = (): Router => {
  const router = Router()

  router.use('/workspaces/:workspaceId', (req, res, next) => {
    const workspaceId = String(req.params.workspaceId ?? '').trim()
    if (!workspaceId) {
      res.status(400).json({ error: 'Missing workspaceId' })
      return
    }

    if (!enforcePatWorkspaceScope(req, res, workspaceId)) return
    next()
  })

  registerWorkplanCrudRoutes(router)
  registerWorkplanToolRoutes(router)
  registerWorkplanImportExportRoutes(router)
  registerWorkplanMeRoutes(router)

  return router
}
