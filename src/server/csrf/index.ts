import crypto from 'node:crypto'
import type express from 'express'

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string
  }
}

const isSafeMethod = (method: string): boolean => {
  const normalized = method.toUpperCase()
  return (
    normalized === 'GET' || normalized === 'HEAD' || normalized === 'OPTIONS'
  )
}

const generateToken = (): string => {
  return crypto.randomBytes(32).toString('base64url')
}

export const registerCsrf = (app: express.Express): void => {
  app.get('/csrf/token', (req, res) => {
    if (!req.session) {
      res.status(500).json({ error: 'Session support is required' })
      return
    }

    const token = generateToken()
    req.session.csrfToken = token
    res.status(200).json({ token })
  })

  app.use((req, res, next) => {
    if (isSafeMethod(req.method)) {
      next()
      return
    }

    if (!req.session) {
      res.status(500).json({ error: 'Session support is required' })
      return
    }

    const sessionToken = req.session.csrfToken
    const headerToken = req.get('x-csrf-token')

    if (!sessionToken || !headerToken || headerToken !== sessionToken) {
      res.status(403).json({ error: 'CSRF token missing or invalid' })
      return
    }

    next()
  })
}
