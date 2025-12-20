import crypto from 'node:crypto'

import type express from 'express'
import { Router } from 'express'

declare module 'express-session' {
  interface SessionData {
    userId?: string
  }
}

import { createDatabase, destroyDatabase } from '../db/index.js'

type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

const nowIso = (): string => new Date().toISOString()

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

export const createWorkspacesRouter = (): Router => {
  const router = Router()

  router.get('/workspaces', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const handle = createDatabase()
    try {
      const workspaces = await handle.db
        .selectFrom('workspaces')
        .innerJoin(
          'workspace_members',
          'workspace_members.workspace_id',
          'workspaces.id',
        )
        .select([
          'workspaces.id as id',
          'workspaces.name as name',
          'workspaces.owner_user_id as owner_user_id',
          'workspace_members.role as role',
        ])
        .where('workspace_members.user_id', '=', userId)
        .orderBy('workspaces.created_at', 'asc')
        .execute()

      res.status(200).json({ workspaces })
    } finally {
      await destroyDatabase(handle)
    }
  })

  router.post('/workspaces', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const name = String(req.body?.name ?? '').trim()
    if (!name) {
      res.status(400).json({ error: 'Missing workspace name' })
      return
    }

    const handle = createDatabase()

    try {
      const workspaceId = crypto.randomBytes(16).toString('base64url')
      const now = nowIso()

      await handle.db
        .insertInto('workspaces')
        .values({
          id: workspaceId,
          owner_user_id: userId,
          name,
          created_at: now,
          updated_at: now,
        })
        .execute()

      await handle.db
        .insertInto('workspace_members')
        .values({
          workspace_id: workspaceId,
          user_id: userId,
          role: 'owner',
          created_at: now,
          updated_at: now,
        })
        .execute()

      res.status(201).json({ id: workspaceId, name })
    } finally {
      await destroyDatabase(handle)
    }
  })

  router.get('/workspaces/:workspaceId/members', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const workspaceId = String(req.params.workspaceId ?? '').trim()
    if (!workspaceId) {
      res.status(400).json({ error: 'Missing workspaceId' })
      return
    }

    const handle = createDatabase()

    try {
      const membership = await handle.db
        .selectFrom('workspace_members')
        .select(['role'])
        .where('workspace_id', '=', workspaceId)
        .where('user_id', '=', userId)
        .executeTakeFirst()

      if (!membership) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }

      const members = await handle.db
        .selectFrom('workspace_members')
        .innerJoin('users', 'users.id', 'workspace_members.user_id')
        .select([
          'workspace_members.user_id as user_id',
          'users.email as email',
          'workspace_members.role as role',
        ])
        .where('workspace_members.workspace_id', '=', workspaceId)
        .orderBy('workspace_members.role', 'asc')
        .execute()

      res.status(200).json({ members })
    } finally {
      await destroyDatabase(handle)
    }
  })

  router.post('/workspaces/:workspaceId/members', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const workspaceId = String(req.params.workspaceId ?? '').trim()
    if (!workspaceId) {
      res.status(400).json({ error: 'Missing workspaceId' })
      return
    }

    const targetUserId = String(req.body?.userId ?? '').trim()
    if (!targetUserId) {
      res.status(400).json({ error: 'Missing userId' })
      return
    }

    const role = String(req.body?.role ?? 'viewer').trim() as WorkspaceRole
    if (!['owner', 'admin', 'editor', 'viewer'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' })
      return
    }

    const handle = createDatabase()

    try {
      const membership = await handle.db
        .selectFrom('workspace_members')
        .select(['role'])
        .where('workspace_id', '=', workspaceId)
        .where('user_id', '=', userId)
        .executeTakeFirst()

      if (!membership || membership.role !== 'owner') {
        res.status(403).json({ error: 'Forbidden' })
        return
      }

      const targetUser = await handle.db
        .selectFrom('users')
        .select(['id'])
        .where('id', '=', targetUserId)
        .executeTakeFirst()

      if (!targetUser) {
        res.status(404).json({ error: 'User not found' })
        return
      }

      const now = nowIso()

      await handle.db
        .insertInto('workspace_members')
        .values({
          workspace_id: workspaceId,
          user_id: targetUserId,
          role,
          created_at: now,
          updated_at: now,
        })
        .execute()

      res.status(201).json({ ok: true })
    } finally {
      await destroyDatabase(handle)
    }
  })

  router.delete(
    '/workspaces/:workspaceId/members/:userId',
    async (req, res) => {
      const userId = requireUserId(req, res)
      if (!userId) return

      const workspaceId = String(req.params.workspaceId ?? '').trim()
      const targetUserId = String(req.params.userId ?? '').trim()

      if (!workspaceId || !targetUserId) {
        res.status(400).json({ error: 'Missing workspaceId or userId' })
        return
      }

      const handle = createDatabase()

      try {
        const membership = await handle.db
          .selectFrom('workspace_members')
          .select(['role'])
          .where('workspace_id', '=', workspaceId)
          .where('user_id', '=', userId)
          .executeTakeFirst()

        if (!membership || membership.role !== 'owner') {
          res.status(403).json({ error: 'Forbidden' })
          return
        }

        await handle.db
          .deleteFrom('workspace_members')
          .where('workspace_id', '=', workspaceId)
          .where('user_id', '=', targetUserId)
          .execute()

        res.status(200).json({ ok: true })
      } finally {
        await destroyDatabase(handle)
      }
    },
  )

  return router
}
