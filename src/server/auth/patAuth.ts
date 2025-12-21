import crypto from 'node:crypto'

import type express from 'express'

import { createDatabase, destroyDatabase } from '../db/index.js'

export type PatAuthContext = {
  type: 'pat'
  patId: string
  userId: string
  workspaceId: string | null
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: PatAuthContext
  }
}

const sha256Hex = (value: string): string => {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const parseBearerToken = (
  headerValue: string | undefined,
): string | undefined => {
  if (!headerValue) return undefined
  const trimmed = headerValue.trim()
  if (!trimmed.toLowerCase().startsWith('bearer ')) return undefined
  const token = trimmed.slice('bearer '.length).trim()
  if (!token) return undefined
  return token
}

export const registerPatAuth = (app: express.Express): void => {
  app.use(async (req, res, next) => {
    const token = parseBearerToken(req.get('authorization'))
    if (!token) {
      next()
      return
    }

    const tokenHash = sha256Hex(token)

    const handle = createDatabase()

    try {
      const pat = await handle.db
        .selectFrom('user_pats')
        .select(['id', 'user_id', 'workspace_id', 'revoked_at'])
        .where('secret_hash', '=', tokenHash)
        .executeTakeFirst()

      if (!pat || pat.revoked_at) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      req.auth = {
        type: 'pat',
        patId: pat.id,
        userId: pat.user_id,
        workspaceId: pat.workspace_id ?? null,
      }

      await handle.db
        .updateTable('user_pats')
        .set({ last_used_at: new Date().toISOString() })
        .where('id', '=', pat.id)
        .execute()

      next()
    } catch (error) {
      next(error)
    } finally {
      await destroyDatabase(handle)
    }
  })
}
