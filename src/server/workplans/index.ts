import fs from 'node:fs'

import type express from 'express'
import { Router } from 'express'

import { createDatabase, destroyDatabase } from '../db/index.js'
import {
  readWorkplanJson,
  resolveWorkplanPath,
  resolveWorkspaceBaseDir,
  withWorkplanLock,
  writeWorkplanJsonAtomic,
} from './storage.js'

declare module 'express-session' {
  interface SessionData {
    userId?: string
  }
}

type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

type Ticket = {
  goal: string
  pullRequests: unknown[]
  needsMoreThoughts?: boolean
  latestWorkedOn?: unknown
}

type WorkplanSummary = {
  id: string
  goal: string
  lastUpdated: string
  prCount: number
  commitCount: number
  latestWorkedOn?: unknown
}

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

const isTicket = (value: unknown): value is Ticket => {
  if (!value || typeof value !== 'object') return false
  const v = value as { goal?: unknown; pullRequests?: unknown }
  if (typeof v.goal !== 'string') return false
  if (!Array.isArray(v.pullRequests)) return false
  return true
}

const buildSummary = (
  workspaceId: string,
  workplanId: string,
): WorkplanSummary | undefined => {
  let filePath: string
  try {
    filePath = resolveWorkplanPath(workspaceId, workplanId)
  } catch {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = withWorkplanLock(workspaceId, workplanId, () => {
      return readWorkplanJson(workspaceId, workplanId)
    })
  } catch {
    return undefined
  }

  if (!isTicket(parsed)) return undefined

  let lastUpdated = new Date().toISOString()
  try {
    const stat = fs.statSync(filePath)
    lastUpdated = stat.mtime.toISOString()
  } catch {
    // ignore
  }

  const prCount = parsed.pullRequests.length
  const commitCount = parsed.pullRequests.reduce((sum: number, pr: unknown) => {
    const commits = (pr as { commits?: unknown })?.commits
    if (!Array.isArray(commits)) return sum
    return sum + commits.length
  }, 0)

  return {
    id: workplanId,
    goal: parsed.goal,
    lastUpdated,
    prCount,
    commitCount,
    ...(parsed.latestWorkedOn ? { latestWorkedOn: parsed.latestWorkedOn } : {}),
  }
}

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

  router.get('/workspaces/:workspaceId/workplans', async (req, res) => {
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
      if (!role) return

      let wsDir: string
      try {
        wsDir = resolveWorkspaceBaseDir(workspaceId)
      } catch {
        res.status(400).json({ error: 'Invalid workspaceId' })
        return
      }
      if (!fs.existsSync(wsDir)) {
        res.status(200).json({ workplans: [] })
        return
      }

      const summaries: WorkplanSummary[] = []

      for (const entry of fs.readdirSync(wsDir)) {
        if (!entry.endsWith('.json')) continue
        const workplanId = entry.slice(0, -'.json'.length)

        try {
          const summary = buildSummary(workspaceId, workplanId)
          if (summary) summaries.push(summary)
        } catch {
          // ignore malformed workplan files
        }
      }

      summaries.sort((a, b) => a.lastUpdated.localeCompare(b.lastUpdated))

      res.status(200).json({ workplans: summaries })
    } finally {
      await destroyDatabase(handle)
    }
  })

  router.get(
    '/workspaces/:workspaceId/workplans/:workplanId',
    async (req, res) => {
      const userId = requireUserId(req, res)
      if (!userId) return

      const workspaceId = String(req.params.workspaceId ?? '').trim()
      const workplanId = String(req.params.workplanId ?? '').trim()

      if (!workspaceId || !workplanId) {
        res.status(400).json({ error: 'Missing workspaceId or workplanId' })
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
        if (!role) return

        let workplan: unknown
        try {
          workplan = withWorkplanLock(workspaceId, workplanId, () => {
            return readWorkplanJson(workspaceId, workplanId)
          })
        } catch {
          res.status(400).json({ error: 'Invalid workplanId' })
          return
        }

        if (!workplan) {
          res.status(404).json({ error: 'Not found' })
          return
        }

        res.status(200).json({ workplan })
      } finally {
        await destroyDatabase(handle)
      }
    },
  )

  router.post('/workspaces/:workspaceId/workplans', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const workspaceId = String(req.params.workspaceId ?? '').trim()
    if (!workspaceId) {
      res.status(400).json({ error: 'Missing workspaceId' })
      return
    }

    const workplanId = String(req.body?.workplanId ?? '').trim()
    const goal = String(req.body?.goal ?? '').trim()

    if (!workplanId) {
      res.status(400).json({ error: 'Missing workplanId' })
      return
    }

    if (!goal) {
      res.status(400).json({ error: 'Missing goal' })
      return
    }

    const handle = createDatabase()
    try {
      const role = await requireWorkspaceRole(
        handle.db,
        res,
        userId,
        workspaceId,
        'owner',
      )
      if (!role) return

      let filePath: string
      try {
        filePath = resolveWorkplanPath(workspaceId, workplanId)
      } catch {
        res.status(400).json({ error: 'Invalid workplanId' })
        return
      }

      const created = withWorkplanLock(workspaceId, workplanId, () => {
        if (fs.existsSync(filePath)) {
          return false
        }

        const ticket: Ticket = {
          goal,
          pullRequests: [],
        }

        return writeWorkplanJsonAtomic(workspaceId, workplanId, ticket)
      })

      if (!created) {
        res.status(409).json({ error: 'Already exists' })
        return
      }

      res.status(201).json({ id: workplanId })
    } finally {
      await destroyDatabase(handle)
    }
  })

  return router
}
