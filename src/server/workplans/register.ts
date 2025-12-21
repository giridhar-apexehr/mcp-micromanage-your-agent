import type express from 'express'

import { createWorkplansRouter } from './index.js'

export const registerWorkplans = (app: express.Express): void => {
  app.use('/api', createWorkplansRouter())
}
