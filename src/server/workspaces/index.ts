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

type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
}

const nowIso = (): string => new Date().toISOString()

const sha256Hex = (value: string): string => {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const addDaysIso = (date: Date, days: number): string => {
  const ms = days * 24 * 60 * 60 * 1000
  return new Date(date.getTime() + ms).toISOString()
}

const getAuthenticatedUserId = (req: express.Request): string | undefined => {
  if ((req as { auth?: { userId?: string } }).auth?.userId) {
    return (req as { auth: { userId: string } }).auth.userId
  }

  if (process.env.NODE_ENV === 'test') {
    const testUserId = req.get('x-test-user-id')
    if (testUserId) return testUserId
  }

  if (!req.session) return undefined
  const userId = (req.session as { userId?: string }).userId
  if (!userId) return undefined
  return userId
}

const getPatWorkspaceId = (req: express.Request): string | null | undefined => {
  const auth = (req as { auth?: { workspaceId?: string | null } }).auth
  if (!auth) return undefined
  if (auth.workspaceId === null) return null
  if (typeof auth.workspaceId === 'string') return auth.workspaceId
  return undefined
}

const enforcePatWorkspaceScope = (
  req: express.Request,
  res: express.Response,
  workspaceId: string,
): boolean => {
  const patWorkspaceId = getPatWorkspaceId(req)
  if (patWorkspaceId === undefined || patWorkspaceId === null) return true

  if (patWorkspaceId !== workspaceId) {
    res.status(403).json({ error: 'Forbidden' })
    return false
  }

  return true
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

const getWorkspaceRole = async (
  db: ReturnType<typeof createDatabase>['db'],
  userId: string,
  workspaceId: string,
): Promise<WorkspaceRole | undefined> => {
  const membership = await db
    .selectFrom('workspace_members')
    .select(['role'])
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .executeTakeFirst()

  if (!membership) return undefined

  const role = String(membership.role) as WorkspaceRole
  if (!['owner', 'admin', 'editor', 'viewer'].includes(role)) return undefined
  return role
}

const requireWorkspaceRole = async (
  db: ReturnType<typeof createDatabase>['db'],
  res: express.Response,
  userId: string,
  workspaceId: string,
  minRole: WorkspaceRole,
): Promise<WorkspaceRole | undefined> => {
  const role = await getWorkspaceRole(db, userId, workspaceId)
  if (!role) {
    res.status(403).json({ error: 'Forbidden' })
    return undefined
  }

  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    res.status(403).json({ error: 'Forbidden' })
    return undefined
  }

  return role
}

export const createWorkspacesRouter = (): Router => {
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

  router.get('/workspaces', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const handle = createDatabase()
    try {
      const patWorkspaceId = getPatWorkspaceId(req)

      let query = handle.db
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

      if (patWorkspaceId && typeof patWorkspaceId === 'string') {
        query = query.where('workspaces.id', '=', patWorkspaceId)
      }

      const workspaces = await query
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

    const patWorkspaceId = getPatWorkspaceId(req)
    if (patWorkspaceId && typeof patWorkspaceId === 'string') {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

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

      await writeAuditEvent(handle.db, req, {
        actorUserId: userId,
        workspaceId: workspaceId,
        action: 'workspaces.create',
        resourceType: 'workspace',
        resourceId: workspaceId,
        metadata: { name },
      })

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
      const role = await requireWorkspaceRole(
        handle.db,
        res,
        userId,
        workspaceId,
        'viewer',
      )
      if (!role) {
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
      const actorRole = await requireWorkspaceRole(
        handle.db,
        res,
        userId,
        workspaceId,
        'owner',
      )
      if (!actorRole) {
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

      await writeAuditEvent(handle.db, req, {
        actorUserId: userId,
        workspaceId,
        action: 'workspace_members.add',
        resourceType: 'workspace_member',
        resourceId: `${workspaceId}:${targetUserId}`,
        metadata: { targetUserId, role },
      })

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
        const actorRole = await requireWorkspaceRole(
          handle.db,
          res,
          userId,
          workspaceId,
          'owner',
        )
        if (!actorRole) {
          return
        }

        await handle.db
          .deleteFrom('workspace_members')
          .where('workspace_id', '=', workspaceId)
          .where('user_id', '=', targetUserId)
          .execute()

        await writeAuditEvent(handle.db, req, {
          actorUserId: userId,
          workspaceId,
          action: 'workspace_members.remove',
          resourceType: 'workspace_member',
          resourceId: `${workspaceId}:${targetUserId}`,
          metadata: { targetUserId },
        })

        res.status(200).json({ ok: true })
      } finally {
        await destroyDatabase(handle)
      }
    },
  )

  router.post('/workspaces/:workspaceId/invites', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const workspaceId = String(req.params.workspaceId ?? '').trim()
    if (!workspaceId) {
      res.status(400).json({ error: 'Missing workspaceId' })
      return
    }

    const handle = createDatabase()

    try {
      const actorRole = await requireWorkspaceRole(
        handle.db,
        res,
        userId,
        workspaceId,
        'owner',
      )
      if (!actorRole) {
        return
      }

      const token = crypto.randomBytes(24).toString('base64url')
      const tokenHash = sha256Hex(token)

      const now = nowIso()
      const expiresAt = addDaysIso(new Date(), 7)
      const inviteId = crypto.randomBytes(16).toString('base64url')

      await handle.db
        .insertInto('workspace_invites')
        .values({
          id: inviteId,
          workspace_id: workspaceId,
          created_by_user_id: userId,
          role: 'viewer',
          token_hash: tokenHash,
          expires_at: expiresAt,
          used_at: null,
          created_at: now,
        })
        .execute()

      await writeAuditEvent(handle.db, req, {
        actorUserId: userId,
        workspaceId,
        action: 'workspace_invites.create',
        resourceType: 'workspace_invite',
        resourceId: inviteId,
        metadata: { expiresAt, role: 'viewer' },
      })

      res.status(201).json({ token, expiresAt, role: 'viewer' })
    } finally {
      await destroyDatabase(handle)
    }
  })

  router.post('/invites/accept', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const token = String(req.body?.token ?? '').trim()
    if (!token) {
      res.status(400).json({ error: 'Missing token' })
      return
    }

    const tokenHash = sha256Hex(token)

    const handle = createDatabase()

    try {
      const invite = await handle.db
        .selectFrom('workspace_invites')
        .select(['id', 'workspace_id', 'role', 'expires_at', 'used_at'])
        .where('token_hash', '=', tokenHash)
        .executeTakeFirst()

      if (!invite) {
        res.status(404).json({ error: 'Invite not found' })
        return
      }

      if (invite.used_at) {
        res.status(400).json({ error: 'Invite already used' })
        return
      }

      if (!enforcePatWorkspaceScope(req, res, invite.workspace_id)) return

      const nowDate = new Date()
      const expiresDate = new Date(invite.expires_at)
      if (Number.isNaN(expiresDate.getTime()) || expiresDate <= nowDate) {
        res.status(400).json({ error: 'Invite expired' })
        return
      }

      const now = nowIso()

      await handle.db
        .insertInto('workspace_members')
        .values({
          workspace_id: invite.workspace_id,
          user_id: userId,
          role: invite.role,
          created_at: now,
          updated_at: now,
        })
        .onConflict((oc) => oc.columns(['workspace_id', 'user_id']).doNothing())
        .execute()

      await handle.db
        .updateTable('workspace_invites')
        .set({ used_at: now })
        .where('id', '=', invite.id)
        .execute()

      await writeAuditEvent(handle.db, req, {
        actorUserId: userId,
        workspaceId: invite.workspace_id,
        action: 'workspace_invites.accept',
        resourceType: 'workspace_invite',
        resourceId: invite.id,
        metadata: { role: invite.role },
      })

      res.status(200).json({ ok: true, workspaceId: invite.workspace_id })
    } finally {
      await destroyDatabase(handle)
    }
  })

  return router
}
