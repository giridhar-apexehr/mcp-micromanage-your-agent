import crypto from 'node:crypto'

import type express from 'express'
import type { Kysely } from 'kysely'

import type { DB } from '../db/types.js'

type AuditEvent = {
  actorUserId: string
  actorPatId: string | null
  workspaceId: string | null
  action: string
  resourceType: string
  resourceId: string | null
  metadata: unknown
}

const nowIso = (): string => new Date().toISOString()

const getActorPatId = (req: express.Request): string | null => {
  const auth = (req as { auth?: { patId?: string } }).auth
  const patId = auth?.patId
  if (typeof patId === 'string' && patId) return patId
  return null
}

export const writeAuditEvent = async (
  db: Kysely<DB>,
  req: express.Request,
  event: Omit<AuditEvent, 'actorPatId'>,
): Promise<void> => {
  const actorPatId = getActorPatId(req)

  await db
    .insertInto('audit_log')
    .values({
      id: crypto.randomBytes(16).toString('base64url'),
      at: nowIso(),
      actor_user_id: event.actorUserId,
      actor_pat_id: actorPatId,
      workspace_id: event.workspaceId,
      action: event.action,
      resource_type: event.resourceType,
      resource_id: event.resourceId,
      metadata_json:
        event.metadata === undefined ? null : JSON.stringify(event.metadata),
    })
    .execute()
}
