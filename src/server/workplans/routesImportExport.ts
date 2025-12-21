import fs from 'node:fs'

import type { Router } from 'express'

import { createDatabase, destroyDatabase } from '../db/index.js'
import { requireUserId, requireWorkspaceRole } from './authz.js'
import {
  readWorkplanJson,
  resolveWorkplanPath,
  withWorkplanLock,
  writeWorkplanJsonAtomic,
} from './storage.js'
import { isTicket } from './summary.js'

const EXPORT_VERSION = 'workplan-export-v1'

export const registerWorkplanImportExportRoutes = (router: Router): void => {
  router.get(
    '/workspaces/:workspaceId/workplans/:workplanId/export',
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

        try {
          resolveWorkplanPath(workspaceId, workplanId)
        } catch {
          res.status(400).json({ error: 'Invalid workplanId' })
          return
        }

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

        if (!isTicket(workplan)) {
          res.status(400).json({ error: 'Invalid workplan data' })
          return
        }

        res.status(200).json({
          version: EXPORT_VERSION,
          exportedAt: new Date().toISOString(),
          workspaceId,
          workplanId,
          workplan,
        })
      } finally {
        await destroyDatabase(handle)
      }
    },
  )

  router.post('/workspaces/:workspaceId/workplans/import', async (req, res) => {
    const userId = requireUserId(req, res)
    if (!userId) return

    const workspaceId = String(req.params.workspaceId ?? '').trim()
    if (!workspaceId) {
      res.status(400).json({ error: 'Missing workspaceId' })
      return
    }

    const version = req.body?.version
    if (version !== EXPORT_VERSION) {
      res.status(400).json({ error: 'Invalid version' })
      return
    }

    const workplanId = String(req.body?.workplanId ?? '').trim()
    if (!workplanId) {
      res.status(400).json({ error: 'Missing workplanId' })
      return
    }

    const workplan = req.body?.workplan
    if (!isTicket(workplan)) {
      res.status(400).json({ error: 'Invalid workplan' })
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
        return writeWorkplanJsonAtomic(workspaceId, workplanId, workplan)
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
