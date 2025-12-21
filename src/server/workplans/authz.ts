import type express from 'express'

import { createDatabase } from '../db/index.js'

declare module 'express-session' {
  interface SessionData {
    userId?: string
  }
}

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
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

export const requireUserId = (
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

const getPatWorkspaceId = (req: express.Request): string | null | undefined => {
  const auth = (req as { auth?: { workspaceId?: string | null } }).auth
  if (!auth) return undefined
  if (auth.workspaceId === null) return null
  if (typeof auth.workspaceId === 'string') return auth.workspaceId
  return undefined
}

export const enforcePatWorkspaceScope = (
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

export const requireWorkspaceRole = async (
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
