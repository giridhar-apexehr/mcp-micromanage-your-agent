import fs from 'node:fs'

import type { Router } from 'express'

import type { Ticket } from '../../values/ticket.js'
import { createDatabase, destroyDatabase } from '../db/index.js'
import {
  readWorkplanJson,
  resolveWorkplanPath,
  resolveWorkspaceBaseDir,
  withWorkplanLock,
  writeWorkplanJsonAtomic,
} from './storage.js'
import { requireUserId, requireWorkspaceRole } from './authz.js'
import { buildSummary, type WorkplanSummary } from './summary.js'

export const registerWorkplanCrudRoutes = (router: Router): void => {
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
          // ignore
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
}
