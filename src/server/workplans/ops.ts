import fs from 'node:fs'

import type {
  InsertCommitInput,
  PlanTaskInput,
  UpdateStatusInput,
} from '../../aggregates/workplan.js'
import type { PullRequest } from '../../values/pullRequest.js'
import { updatePRStatusBasedOnCommits } from '../../values/pullRequest.js'
import { validateStatusTransition } from '../../values/status.js'
import { planTicket, type Ticket } from '../../values/ticket.js'
import {
  buildTrackPayload,
  countInProgressCommits,
  isTicket,
} from './summary.js'
import {
  readWorkplanJson,
  resolveWorkplanPath,
  withWorkplanLock,
  writeWorkplanJsonAtomic,
} from './storage.js'

export const planWorkplan = (
  workspaceId: string,
  workplanId: string,
  planParams: PlanTaskInput,
): { status: number; body: unknown } => {
  let filePath: string
  try {
    filePath = resolveWorkplanPath(workspaceId, workplanId)
  } catch {
    return { status: 400, body: { error: 'Invalid workplanId' } }
  }

  const ticket = planTicket(planParams)

  const ok = withWorkplanLock(workspaceId, workplanId, () => {
    return writeWorkplanJsonAtomic(workspaceId, workplanId, ticket)
  })

  if (!ok) {
    return { status: 500, body: { error: 'Failed to write workplan' } }
  }

  let lastUpdated = new Date().toISOString()
  try {
    const stat = fs.statSync(filePath)
    lastUpdated = stat.mtime.toISOString()
  } catch {
    // ignore
  }

  return {
    status: 200,
    body: {
      ok: true,
      id: workplanId,
      lastUpdated,
      prCount: ticket.pullRequests.length,
      commitCount: ticket.pullRequests.reduce(
        (sum: number, pr: PullRequest) => sum + pr.commits.length,
        0,
      ),
    },
  }
}

export const trackWorkplan = (
  workspaceId: string,
  workplanId: string,
  prIndex?: number,
): { status: number; body: unknown } => {
  let ticket: unknown
  try {
    ticket = withWorkplanLock(workspaceId, workplanId, () => {
      return readWorkplanJson(workspaceId, workplanId)
    })
  } catch {
    return { status: 400, body: { error: 'Invalid workplanId' } }
  }

  if (!ticket) {
    return { status: 404, body: { error: 'Not found' } }
  }

  if (!isTicket(ticket)) {
    return { status: 400, body: { error: 'Invalid workplan data' } }
  }

  return {
    status: 200,
    body: {
      workplanId,
      ...buildTrackPayload(ticket, prIndex),
    },
  }
}

export const updateWorkplan = (
  workspaceId: string,
  workplanId: string,
  input: UpdateStatusInput,
): { status: number; body: unknown } => {
  try {
    return withWorkplanLock(workspaceId, workplanId, () => {
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
      const validation = validateStatusTransition(currentStatus, input.status)
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
              ticket.pullRequests[pullRequestIndex].commits[commitIdx].status =
                'not_started'
            }
          })
        })
      }

      ticket.pullRequests[prIndex].commits[commitIndex].status = input.status

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
  } catch {
    return { status: 400, body: { error: 'Invalid workplanId' } }
  }
}

export const insertCommitWorkplan = (
  workspaceId: string,
  workplanId: string,
  input: InsertCommitInput,
): { status: number; body: unknown } => {
  try {
    return withWorkplanLock(workspaceId, workplanId, () => {
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
  } catch {
    return { status: 400, body: { error: 'Invalid workplanId' } }
  }
}
