import crypto from 'node:crypto'

import type express from 'express'
import { Router } from 'express'

import { writeAuditEvent } from '../audit/index.js'
import { createDatabase, destroyDatabase } from '../db/index.js'

declare module 'express-session' {
  interface SessionData {
    userId?: string
  }
}

const nowIso = (): string => new Date().toISOString()

const sha256Hex = (value: string): string => {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const getAuthenticatedUserId = (req: express.Request): string | undefined => {
  if (process.env.NODE_ENV === 'test') {
    const testUserId = req.get('x-test-user-id')
    if (testUserId) return testUserId
  }

  if (!req.session) return undefined
  const userId = (req.session as { userId?: string }).userId
  if (!userId) return undefined
  return userId
}

const requireUserId = (
  req: express.Request,
  res: express.Response,
): string | undefined => {
  const userId = getAuthenticatedUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return undefined
  }
  return userId
}

export const createPatsRouter = (): Router => {
  const router = Router()

  router.get('/pats', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const handle = createDatabase()
    try {
      const pats = await handle.db
        .selectFrom('user_pats')
        .select([
          'id',
          'name',
          'workspace_id',
          'created_at',
          'last_used_at',
          'revoked_at',
        ])
        .where('user_id', '=', userId)
        .orderBy('created_at', 'desc')
        .execute()

      res.status(200).json({ pats })
    } finally {
      await destroyDatabase(handle)
    }
  })

  router.post('/pats', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const name = String(req.body?.name ?? '').trim()
    if (!name) {
      res.status(400).json({ error: 'Missing PAT name' })
      return
    }

    const workspaceIdRaw = req.body?.workspaceId
    const workspaceId =
      typeof workspaceIdRaw === 'string' && workspaceIdRaw.trim()
        ? workspaceIdRaw.trim()
        : null

    const handle = createDatabase()

    try {
      if (workspaceId) {
        const membership = await handle.db
          .selectFrom('workspace_members')
          .select(['user_id'])
          .where('workspace_id', '=', workspaceId)
          .where('user_id', '=', userId)
          .executeTakeFirst()

        if (!membership) {
          res.status(403).json({ error: 'Forbidden' })
          return
        }
      }

      const id = crypto.randomBytes(16).toString('base64url')
      const secret = crypto.randomBytes(32).toString('base64url')
      const secretHash = sha256Hex(secret)
      const now = nowIso()

      await handle.db
        .insertInto('user_pats')
        .values({
          id,
          user_id: userId,
          workspace_id: workspaceId,
          name,
          secret_hash: secretHash,
          created_at: now,
          last_used_at: null,
          revoked_at: null,
        })
        .execute()

      await writeAuditEvent(handle.db, req, {
        actorUserId: userId,
        workspaceId,
        action: 'pats.create',
        resourceType: 'pat',
        resourceId: id,
        metadata: { name },
      })

      res.status(201).json({ id, secret })
    } finally {
      await destroyDatabase(handle)
    }
  })

  router.delete('/pats/:id', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const id = String(req.params.id ?? '').trim()
    if (!id) {
      res.status(400).json({ error: 'Missing id' })
      return
    }

    const handle = createDatabase()

    try {
      const existing = await handle.db
        .selectFrom('user_pats')
        .select(['id', 'revoked_at', 'workspace_id'])
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .executeTakeFirst()

      if (!existing) {
        res.status(404).json({ error: 'Not found' })
        return
      }

      if (!existing.revoked_at) {
        await handle.db
          .updateTable('user_pats')
          .set({ revoked_at: nowIso() })
          .where('id', '=', id)
          .where('user_id', '=', userId)
          .execute()
      }

      await writeAuditEvent(handle.db, req, {
        actorUserId: userId,
        workspaceId: existing.workspace_id ?? null,
        action: 'pats.revoke',
        resourceType: 'pat',
        resourceId: id,
        metadata: {},
      })

      res.status(200).json({ ok: true })
    } finally {
      await destroyDatabase(handle)
    }
  })

  return router
}
