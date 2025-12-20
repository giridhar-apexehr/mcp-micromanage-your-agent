import type express from 'express'

import { createWorkspacesRouter } from './index.js'

export const registerWorkspaces = (app: express.Express): void => {
  app.use('/api', createWorkspacesRouter())
}
