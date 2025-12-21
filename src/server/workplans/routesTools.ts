import fs from 'node:fs'

import type { Router } from 'express'

import type {
  InsertCommitInput,
  PlanTaskInput,
  UpdateStatusInput,
} from '../../aggregates/workplan.js'
import type { PullRequest } from '../../values/pullRequest.js'
import { updatePRStatusBasedOnCommits } from '../../values/pullRequest.js'
import { validateStatusTransition } from '../../values/status.js'
import { planTicket, type Ticket } from '../../values/ticket.js'
import { createDatabase, destroyDatabase } from '../db/index.js'
import { requireUserId, requireWorkspaceRole } from './authz.js'
import {
  readWorkplanJson,
  resolveWorkplanPath,
  withWorkplanLock,
  writeWorkplanJsonAtomic,
} from './storage.js'
import {
  buildTrackPayload,
  countInProgressCommits,
  isStatus,
  isTicket,
} from './summary.js'

export const registerWorkplanToolRoutes = (router: Router): void => {
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
          prPlans: prPlansRaw as PlanTaskInput['prPlans'],
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

      const prIndexRaw = (req.query as { prIndex?: unknown })?.prIndex
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
            status: 'not_started' as const,
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
}
