import fs from 'node:fs'

import type { Router } from 'express'

import type {
  InsertCommitInput,
  PlanTaskInput,
  UpdateStatusInput,
} from '../../aggregates/workplan.js'
import { createDatabase, destroyDatabase } from '../db/index.js'
import {
  requireUserId,
  requireWorkspaceRole,
  type WorkspaceRole,
} from './authz.js'
import {
  insertCommitWorkplan,
  planWorkplan,
  trackWorkplan,
  updateWorkplan,
} from './ops.js'
import { resolveWorkplanPath } from './storage.js'
import { isStatus } from './summary.js'

type Membership = { workspaceId: string; role: WorkspaceRole }

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
}

const isWorkspaceRole = (value: string): value is WorkspaceRole => {
  return (
    value === 'owner' ||
    value === 'admin' ||
    value === 'editor' ||
    value === 'viewer'
  )
}

const getBoundWorkspaceIdFromAuth = (
  req: unknown,
): string | null | undefined => {
  const auth = (
    req as { auth?: { type?: string; workspaceId?: string | null } }
  ).auth
  if (!auth || auth.type !== 'pat') return undefined
  if (auth.workspaceId === null) return null
  if (typeof auth.workspaceId === 'string') return auth.workspaceId
  return undefined
}

const validateWorkplanId = (
  value: string,
): { ok: true; value: string } | { ok: false; error: string } => {
  const trimmed = value.trim()
  if (!trimmed) return { ok: false, error: 'Missing workplanId' }
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { ok: false, error: 'Invalid workplanId' }
  }
  return { ok: true, value: trimmed }
}

const listMemberships = async (userId: string): Promise<Membership[]> => {
  const handle = createDatabase()
  try {
    const rows = await handle.db
      .selectFrom('workspace_members')
      .select(['workspace_id', 'role'])
      .where('user_id', '=', userId)
      .execute()

    const memberships: Membership[] = []
    for (const row of rows) {
      const workspaceId = String(row.workspace_id)
      const roleRaw = String(row.role)
      if (!isWorkspaceRole(roleRaw)) continue
      memberships.push({ workspaceId, role: roleRaw })
    }

    return memberships
  } finally {
    await destroyDatabase(handle)
  }
}

const resolveWorkspaceForWorkplan = (
  memberships: Membership[],
  workplanId: string,
  minRole: WorkspaceRole,
):
  | { ok: true; workspaceId: string }
  | { ok: false; status: number; body: unknown } => {
  const matches: Membership[] = []

  for (const membership of memberships) {
    let filePath: string
    try {
      filePath = resolveWorkplanPath(membership.workspaceId, workplanId)
    } catch {
      continue
    }

    if (fs.existsSync(filePath)) {
      matches.push(membership)
    }
  }

  if (matches.length === 0) {
    return { ok: false, status: 404, body: { error: 'Not found' } }
  }

  const eligible = matches.filter(
    (m) => ROLE_RANK[m.role] >= ROLE_RANK[minRole],
  )

  if (eligible.length === 0) {
    return { ok: false, status: 403, body: { error: 'Forbidden' } }
  }

  if (eligible.length > 1) {
    return {
      ok: false,
      status: 409,
      body: {
        error: 'Ambiguous workplanId',
        workspaceIds: eligible.map((m) => m.workspaceId),
      },
    }
  }

  return { ok: true, workspaceId: eligible[0].workspaceId }
}

const resolveWorkspaceForPlan = (
  memberships: Membership[],
  boundWorkspaceId: string | null | undefined,
  workplanId: string,
):
  | { ok: true; workspaceId: string }
  | { ok: false; status: number; body: unknown } => {
  const existing = resolveWorkspaceForWorkplan(memberships, workplanId, 'owner')
  if (existing.ok) return existing

  if (existing.status !== 404) {
    return existing
  }

  if (typeof boundWorkspaceId === 'string') {
    const bound = memberships.find((m) => m.workspaceId === boundWorkspaceId)
    if (!bound) {
      return { ok: false, status: 403, body: { error: 'Forbidden' } }
    }
    if (ROLE_RANK[bound.role] < ROLE_RANK.owner) {
      return { ok: false, status: 403, body: { error: 'Forbidden' } }
    }
    return { ok: true, workspaceId: bound.workspaceId }
  }

  const eligible = memberships.filter(
    (m) => ROLE_RANK[m.role] >= ROLE_RANK.owner,
  )
  if (eligible.length === 0) {
    return { ok: false, status: 403, body: { error: 'Forbidden' } }
  }
  if (eligible.length > 1) {
    return {
      ok: false,
      status: 409,
      body: {
        error: 'Ambiguous workspace for new workplanId',
        workspaceIds: eligible.map((m) => m.workspaceId),
      },
    }
  }

  return { ok: true, workspaceId: eligible[0].workspaceId }
}

export const registerWorkplanMeRoutes = (router: Router): void => {
  router.get('/me/workplans/:workplanId/track', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const validated = validateWorkplanId(String(req.params.workplanId ?? ''))
    if (!validated.ok) {
      res.status(400).json({ error: validated.error })
      return
    }
    const workplanId = validated.value

    const prIndexRaw = (req.query as { prIndex?: unknown })?.prIndex
    const prIndex =
      typeof prIndexRaw === 'string' && prIndexRaw.trim()
        ? Number.parseInt(prIndexRaw, 10)
        : undefined

    if (prIndex !== undefined && Number.isNaN(prIndex)) {
      res.status(400).json({ error: 'Invalid prIndex' })
      return
    }

    const boundWorkspaceId = getBoundWorkspaceIdFromAuth(req)

    let memberships = await listMemberships(userId)
    if (typeof boundWorkspaceId === 'string') {
      memberships = memberships.filter(
        (m) => m.workspaceId === boundWorkspaceId,
      )
    }

    const resolved = resolveWorkspaceForWorkplan(
      memberships,
      workplanId,
      'viewer',
    )
    if (!resolved.ok) {
      res.status(resolved.status).json(resolved.body)
      return
    }

    const result = trackWorkplan(resolved.workspaceId, workplanId, prIndex)
    res.status(result.status).json(result.body)
  })

  router.post('/me/workplans/:workplanId/plan', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const validated = validateWorkplanId(String(req.params.workplanId ?? ''))
    if (!validated.ok) {
      res.status(400).json({ error: validated.error })
      return
    }
    const workplanId = validated.value

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

    const boundWorkspaceId = getBoundWorkspaceIdFromAuth(req)

    let memberships = await listMemberships(userId)
    if (typeof boundWorkspaceId === 'string') {
      memberships = memberships.filter(
        (m) => m.workspaceId === boundWorkspaceId,
      )
    }

    const resolved = resolveWorkspaceForPlan(
      memberships,
      boundWorkspaceId,
      workplanId,
    )
    if (!resolved.ok) {
      res.status(resolved.status).json(resolved.body)
      return
    }

    const handle = createDatabase()
    try {
      const role = await requireWorkspaceRole(
        handle.db,
        res,
        userId,
        resolved.workspaceId,
        'owner',
      )
      if (!role) return

      const planParams: PlanTaskInput = {
        goal: goalRaw,
        prPlans: prPlansRaw as PlanTaskInput['prPlans'],
        needsMoreThoughts:
          typeof req.body?.needsMoreThoughts === 'boolean'
            ? req.body.needsMoreThoughts
            : undefined,
      }

      const result = planWorkplan(resolved.workspaceId, workplanId, planParams)
      res.status(result.status).json(result.body)
    } finally {
      await destroyDatabase(handle)
    }
  })

  router.post('/me/workplans/:workplanId/update', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const validated = validateWorkplanId(String(req.params.workplanId ?? ''))
    if (!validated.ok) {
      res.status(400).json({ error: validated.error })
      return
    }
    const workplanId = validated.value

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

    const boundWorkspaceId = getBoundWorkspaceIdFromAuth(req)

    let memberships = await listMemberships(userId)
    if (typeof boundWorkspaceId === 'string') {
      memberships = memberships.filter(
        (m) => m.workspaceId === boundWorkspaceId,
      )
    }

    const resolved = resolveWorkspaceForWorkplan(
      memberships,
      workplanId,
      'owner',
    )
    if (!resolved.ok) {
      res.status(resolved.status).json(resolved.body)
      return
    }

    const handle = createDatabase()
    try {
      const role = await requireWorkspaceRole(
        handle.db,
        res,
        userId,
        resolved.workspaceId,
        'owner',
      )
      if (!role) return

      const result = updateWorkplan(resolved.workspaceId, workplanId, input)
      res.status(result.status).json(result.body)
    } finally {
      await destroyDatabase(handle)
    }
  })

  router.post('/me/workplans/:workplanId/insert-commit', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const validated = validateWorkplanId(String(req.params.workplanId ?? ''))
    if (!validated.ok) {
      res.status(400).json({ error: validated.error })
      return
    }
    const workplanId = validated.value

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

    const boundWorkspaceId = getBoundWorkspaceIdFromAuth(req)

    let memberships = await listMemberships(userId)
    if (typeof boundWorkspaceId === 'string') {
      memberships = memberships.filter(
        (m) => m.workspaceId === boundWorkspaceId,
      )
    }

    const resolved = resolveWorkspaceForWorkplan(
      memberships,
      workplanId,
      'owner',
    )
    if (!resolved.ok) {
      res.status(resolved.status).json(resolved.body)
      return
    }

    const handle = createDatabase()
    try {
      const role = await requireWorkspaceRole(
        handle.db,
        res,
        userId,
        resolved.workspaceId,
        'owner',
      )
      if (!role) return

      const result = insertCommitWorkplan(
        resolved.workspaceId,
        workplanId,
        input,
      )
      res.status(result.status).json(result.body)
    } finally {
      await destroyDatabase(handle)
    }
  })
}
