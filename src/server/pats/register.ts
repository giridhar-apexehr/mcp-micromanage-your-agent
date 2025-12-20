import type express from 'express'

import { createPatsRouter } from './index.js'

export const registerPats = (app: express.Express): void => {
  app.use('/api', createPatsRouter())
}
