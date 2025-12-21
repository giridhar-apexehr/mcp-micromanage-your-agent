import fs from 'node:fs'

import type { PullRequest } from '../../values/pullRequest.js'
import { generatePRSummaries } from '../../values/pullRequest.js'
import type { Status } from '../../values/status.js'
import type { Ticket } from '../../values/ticket.js'
import {
  readWorkplanJson,
  resolveWorkplanPath,
  withWorkplanLock,
} from './storage.js'

export type WorkplanSummary = {
  id: string
  goal: string
  lastUpdated: string
  prCount: number
  commitCount: number
  latestWorkedOn?: unknown
}

export const isTicket = (value: unknown): value is Ticket => {
  if (!value || typeof value !== 'object') return false
  const v = value as { goal?: unknown; pullRequests?: unknown }
  if (typeof v.goal !== 'string') return false
  if (!Array.isArray(v.pullRequests)) return false
  return true
}

export const isStatus = (value: unknown): value is Status => {
  return (
    value === 'not_started' ||
    value === 'in_progress' ||
    value === 'user_review' ||
    value === 'completed' ||
    value === 'cancelled' ||
    value === 'needsRefinment'
  )
}

export const countInProgressCommits = (ticket: Ticket): number => {
  return ticket.pullRequests.reduce((sum: number, pr: PullRequest) => {
    return (
      sum +
      pr.commits.filter((c: { status: Status }) => c.status === 'in_progress')
        .length
    )
  }, 0)
}

export const buildTrackPayload = (
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

export const buildSummary = (
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
