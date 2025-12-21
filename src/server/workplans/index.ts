import fs from 'node:fs'

import type express from 'express'
import { Router } from 'express'

import type {
  InsertCommitInput,
  PlanTaskInput,
  UpdateStatusInput,
} from '../../aggregates/workplan.js'
import { createDatabase, destroyDatabase } from '../db/index.js'
import type { PullRequest } from '../../values/pullRequest.js'
import {
  generatePRSummaries,
  updatePRStatusBasedOnCommits,
} from '../../values/pullRequest.js'
import { type Status, validateStatusTransition } from '../../values/status.js'
import { planTicket, type Ticket } from '../../values/ticket.js'
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

const isStatus = (value: unknown): value is Status => {
  return (
    value === 'not_started' ||
    value === 'in_progress' ||
    value === 'user_review' ||
    value === 'completed' ||
    value === 'cancelled' ||
    value === 'needsRefinment'
  )
}

const countInProgressCommits = (ticket: Ticket): number => {
  return ticket.pullRequests.reduce((sum: number, pr: PullRequest) => {
    return (
      sum +
      pr.commits.filter((c: { status: Status }) => c.status === 'in_progress')
        .length
    )
  }, 0)
}

const buildTrackPayload = (
  ticket: Ticket,
  prIndex?: number,
): Record<string, unknown> => {
  const completedPRs = ticket.pullRequests.filter(
    (pr: PullRequest) => pr.status === 'completed',
  ).length
  const totalPRs = ticket.pullRequests.length

  const completedCommits = ticket.pullRequests.reduce(
    (sum: number, pr: PullRequest) => {
      const nonCancelledCommits = pr.commits.filter(
        (c: { status: Status }) => c.status !== 'cancelled',
      )
      return (
        sum +
        nonCancelledCommits.filter(
          (c: { status: Status }) => c.status === 'completed',
        ).length
      )
    },
    0,
  )
  const totalCommits = ticket.pullRequests.reduce(
    (sum: number, pr: PullRequest) => {
      return (
        sum +
        pr.commits.filter((c: { status: Status }) => c.status !== 'cancelled')
          .length
      )
    },
    0,
  )

  const prSummaries = generatePRSummaries(ticket.pullRequests)

  const detailedPRs = ticket.pullRequests.map(
    (pr: PullRequest, prIdx: number) => {
      const detailedCommits = pr.commits.map((commit, commitIndex) => {
        return {
          commitIndex,
          goal: commit.goal,
          status: commit.status,
          developerNote: commit.developerNote,
        }
      })

      return {
        prIndex: prIdx,
        goal: pr.goal,
        status: pr.status,
        developerNote: pr.developerNote,
        commits: detailedCommits,
      }
    },
  )

  const filteredPrSummaries =
    prIndex !== undefined
      ? prSummaries.filter((pr) => pr.prIndex === prIndex)
      : prSummaries
  const filteredDetailedPRs =
    prIndex !== undefined
      ? detailedPRs.filter((pr) => pr.prIndex === prIndex)
      : detailedPRs

  return {
    goal: ticket.goal,
    latestWorkedOn: ticket.latestWorkedOn ?? null,
    progress: {
      prs: `${completedPRs}/${totalPRs}`,
      commits: `${completedCommits}/${totalCommits}`,
      percentComplete: totalCommits
        ? Math.round((completedCommits / totalCommits) * 100)
        : 0,
    },
    pullRequests: filteredPrSummaries,
    detailedPullRequests: filteredDetailedPRs,
  }
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

  router.post(
    '/workspaces/:workspaceId/workplans/:workplanId/plan',
    async (req, res) => {
      const userId = requireUserId(req, res)
      if (!userId) return

      const workspaceId = String(req.params.workspaceId ?? '').trim()
      const workplanId = String(req.params.workplanId ?? '').trim()

      if (!workspaceId || !workplanId) {
        res.status(400).json({ error: 'Missing workspaceId or workplanId' })
        return
      }

      const goalRaw = req.body?.goal
      const prPlansRaw = req.body?.prPlans

      if (typeof goalRaw !== 'string' || !goalRaw.trim()) {
        res.status(400).json({ error: 'Missing goal' })
        return
      }

      if (!Array.isArray(prPlansRaw) || prPlansRaw.length === 0) {
        res.status(400).json({ error: 'Missing prPlans' })
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

        const planParams: PlanTaskInput = {
          goal: goalRaw,
          prPlans: prPlansRaw,
          needsMoreThoughts:
            typeof req.body?.needsMoreThoughts === 'boolean'
              ? req.body.needsMoreThoughts
              : undefined,
        }

        const ticket = planTicket(planParams)

        const ok = withWorkplanLock(workspaceId, workplanId, () => {
          return writeWorkplanJsonAtomic(workspaceId, workplanId, ticket)
        })

        if (!ok) {
          res.status(500).json({ error: 'Failed to write workplan' })
          return
        }

        let lastUpdated = new Date().toISOString()
        try {
          const stat = fs.statSync(filePath)
          lastUpdated = stat.mtime.toISOString()
        } catch {
          // ignore
        }

        res.status(200).json({
          ok: true,
          id: workplanId,
          lastUpdated,
          prCount: ticket.pullRequests.length,
          commitCount: ticket.pullRequests.reduce(
            (sum: number, pr: PullRequest) => sum + pr.commits.length,
            0,
          ),
        })
      } finally {
        await destroyDatabase(handle)
      }
    },
  )

  router.get(
    '/workspaces/:workspaceId/workplans/:workplanId/track',
    async (req, res) => {
      const userId = requireUserId(req, res)
      if (!userId) return

      const workspaceId = String(req.params.workspaceId ?? '').trim()
      const workplanId = String(req.params.workplanId ?? '').trim()

      if (!workspaceId || !workplanId) {
        res.status(400).json({ error: 'Missing workspaceId or workplanId' })
        return
      }

      const prIndexRaw = req.query?.prIndex
      const prIndex =
        typeof prIndexRaw === 'string' && prIndexRaw.trim()
          ? Number.parseInt(prIndexRaw, 10)
          : undefined

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

        let ticket: unknown
        try {
          ticket = withWorkplanLock(workspaceId, workplanId, () => {
            return readWorkplanJson(workspaceId, workplanId)
          })
        } catch {
          res.status(400).json({ error: 'Invalid workplanId' })
          return
        }

        if (!ticket) {
          res.status(404).json({ error: 'Not found' })
          return
        }

        if (!isTicket(ticket)) {
          res.status(400).json({ error: 'Invalid workplan data' })
          return
        }

        if (prIndex !== undefined && Number.isNaN(prIndex)) {
          res.status(400).json({ error: 'Invalid prIndex' })
          return
        }

        res.status(200).json({
          workplanId,
          ...buildTrackPayload(ticket, prIndex),
        })
      } finally {
        await destroyDatabase(handle)
      }
    },
  )

  router.post(
    '/workspaces/:workspaceId/workplans/:workplanId/update',
    async (req, res) => {
      const userId = requireUserId(req, res)
      if (!userId) return

      const workspaceId = String(req.params.workspaceId ?? '').trim()
      const workplanId = String(req.params.workplanId ?? '').trim()

      if (!workspaceId || !workplanId) {
        res.status(400).json({ error: 'Missing workspaceId or workplanId' })
        return
      }

      const prIndexRaw = req.body?.prIndex
      const commitIndexRaw = req.body?.commitIndex
      const statusRaw = req.body?.status

      if (!Number.isInteger(prIndexRaw) || !Number.isInteger(commitIndexRaw)) {
        res.status(400).json({ error: 'Invalid prIndex or commitIndex' })
        return
      }

      if (!isStatus(statusRaw)) {
        res.status(400).json({ error: 'Invalid status' })
        return
      }

      const input: UpdateStatusInput = {
        prIndex: prIndexRaw,
        commitIndex: commitIndexRaw,
        status: statusRaw,
        goal: typeof req.body?.goal === 'string' ? req.body.goal : undefined,
        developerNote:
          typeof req.body?.developerNote === 'string'
            ? req.body.developerNote
            : undefined,
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

        const result = withWorkplanLock(workspaceId, workplanId, () => {
          const current = readWorkplanJson<Ticket>(workspaceId, workplanId)
          if (!current) {
            return { status: 404 as const, body: { error: 'Not found' } }
          }

          if (!isTicket(current)) {
            return {
              status: 400 as const,
              body: { error: 'Invalid workplan data' },
            }
          }

          const ticket = current

          const prIndex = input.prIndex
          if (prIndex < 0 || prIndex >= ticket.pullRequests.length) {
            return { status: 400 as const, body: { error: 'Invalid prIndex' } }
          }

          const pr = ticket.pullRequests[prIndex]

          if (input.commitIndex === -1) {
            if (input.developerNote === undefined) {
              return {
                status: 400 as const,
                body: {
                  error: 'developerNote is required when commitIndex = -1',
                },
              }
            }

            ticket.pullRequests[prIndex] = {
              ...pr,
              developerNote: input.developerNote,
            }

            const ok = writeWorkplanJsonAtomic(workspaceId, workplanId, ticket)
            return ok
              ? { status: 200 as const, body: { ok: true } }
              : {
                  status: 500 as const,
                  body: { error: 'Failed to write workplan' },
                }
          }

          const commitIndex = input.commitIndex
          if (commitIndex < 0 || commitIndex >= pr.commits.length) {
            return {
              status: 400 as const,
              body: { error: 'Invalid commitIndex' },
            }
          }

          const currentStatus = pr.commits[commitIndex].status
          const validation = validateStatusTransition(
            currentStatus,
            input.status,
          )
          if (!validation.isValid) {
            return {
              status: 400 as const,
              body: {
                error: validation.errorMessage ?? 'Invalid status transition',
              },
            }
          }

          const shouldUpdateLatestWorkedOn =
            currentStatus !== input.status &&
            (input.status === 'in_progress' ||
              input.status === 'user_review' ||
              input.status === 'completed')

          if (input.status === 'in_progress') {
            ticket.pullRequests.forEach((pullRequest, pullRequestIndex) => {
              pullRequest.commits.forEach((commit, commitIdx) => {
                if (pullRequestIndex === prIndex && commitIdx === commitIndex) {
                  return
                }
                if (commit.status === 'in_progress') {
                  ticket.pullRequests[pullRequestIndex].commits[
                    commitIdx
                  ].status = 'not_started'
                }
              })
            })
          }

          ticket.pullRequests[prIndex].commits[commitIndex].status =
            input.status

          if (input.goal !== undefined) {
            ticket.pullRequests[prIndex].commits[commitIndex].goal = input.goal
          }

          if (input.developerNote !== undefined) {
            ticket.pullRequests[prIndex].commits[commitIndex].developerNote =
              input.developerNote
          }

          if (shouldUpdateLatestWorkedOn) {
            ticket.latestWorkedOn = {
              at: new Date().toISOString(),
              prIndex,
              commitIndex,
              status: input.status,
            }
          }

          ticket.pullRequests[prIndex] = updatePRStatusBasedOnCommits(
            ticket.pullRequests[prIndex],
          )

          const ok = writeWorkplanJsonAtomic(workspaceId, workplanId, ticket)
          return ok
            ? {
                status: 200 as const,
                body: {
                  ok: true,
                  latestWorkedOn: ticket.latestWorkedOn ?? null,
                },
              }
            : {
                status: 500 as const,
                body: { error: 'Failed to write workplan' },
              }
        })

        res.status(result.status).json(result.body)
      } catch {
        res.status(400).json({ error: 'Invalid workplanId' })
      } finally {
        await destroyDatabase(handle)
      }
    },
  )

  router.post(
    '/workspaces/:workspaceId/workplans/:workplanId/insert-commit',
    async (req, res) => {
      const userId = requireUserId(req, res)
      if (!userId) return

      const workspaceId = String(req.params.workspaceId ?? '').trim()
      const workplanId = String(req.params.workplanId ?? '').trim()

      if (!workspaceId || !workplanId) {
        res.status(400).json({ error: 'Missing workspaceId or workplanId' })
        return
      }

      const prIndexRaw = req.body?.prIndex
      const insertAfterCommitIndexRaw = req.body?.insertAfterCommitIndex
      const goalRaw = req.body?.goal
      const developerNoteRaw = req.body?.developerNote

      if (
        !Number.isInteger(prIndexRaw) ||
        !Number.isInteger(insertAfterCommitIndexRaw)
      ) {
        res
          .status(400)
          .json({ error: 'Invalid prIndex or insertAfterCommitIndex' })
        return
      }

      if (typeof goalRaw !== 'string' || !goalRaw.trim()) {
        res.status(400).json({ error: 'Missing goal' })
        return
      }

      const input: InsertCommitInput = {
        prIndex: prIndexRaw,
        insertAfterCommitIndex: insertAfterCommitIndexRaw,
        goal: goalRaw,
        developerNote:
          typeof developerNoteRaw === 'string' ? developerNoteRaw : undefined,
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

        const result = withWorkplanLock(workspaceId, workplanId, () => {
          const current = readWorkplanJson<Ticket>(workspaceId, workplanId)
          if (!current) {
            return { status: 404 as const, body: { error: 'Not found' } }
          }

          if (!isTicket(current)) {
            return {
              status: 400 as const,
              body: { error: 'Invalid workplan data' },
            }
          }

          const ticket = current

          const inProgressCommits = countInProgressCommits(ticket)
          if (inProgressCommits > 1) {
            return {
              status: 400 as const,
              body: {
                error:
                  'Invalid state: more than one commit is currently in_progress',
              },
            }
          }

          const prIndex = input.prIndex
          if (prIndex < 0 || prIndex >= ticket.pullRequests.length) {
            return { status: 400 as const, body: { error: 'Invalid prIndex' } }
          }

          const pr = ticket.pullRequests[prIndex]
          const commits = pr.commits

          const insertAfterCommitIndex = input.insertAfterCommitIndex
          if (
            insertAfterCommitIndex < -1 ||
            insertAfterCommitIndex >= commits.length
          ) {
            return {
              status: 400 as const,
              body: { error: 'Invalid insertAfterCommitIndex' },
            }
          }

          const insertAtIndex =
            insertAfterCommitIndex === -1 ? 0 : insertAfterCommitIndex + 1

          const newCommit = {
            goal: input.goal,
            status: 'not_started' as Status,
            developerNote: input.developerNote,
          }

          const newCommits = [
            ...commits.slice(0, insertAtIndex),
            newCommit,
            ...commits.slice(insertAtIndex),
          ]

          ticket.pullRequests[prIndex] = updatePRStatusBasedOnCommits({
            ...pr,
            commits: newCommits,
          })

          const ok = writeWorkplanJsonAtomic(workspaceId, workplanId, ticket)
          return ok
            ? {
                status: 200 as const,
                body: { ok: true, insertedCommitIndex: insertAtIndex },
              }
            : {
                status: 500 as const,
                body: { error: 'Failed to write workplan' },
              }
        })

        res.status(result.status).json(result.body)
      } catch {
        res.status(400).json({ error: 'Invalid workplanId' })
      } finally {
        await destroyDatabase(handle)
      }
    },
  )

  return router
}
