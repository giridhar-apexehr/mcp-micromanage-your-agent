import crypto from 'node:crypto'

import type { Kysely } from 'kysely'

import type { DB } from '../db/types.js'

type ProvisionUserInput = {
  providerId: string
  claims: {
    sub?: string
    email?: string
  }
}

export const provisionUserAndDefaultWorkspace = async (
  db: Kysely<DB>,
  input: ProvisionUserInput,
): Promise<{ userId: string; workspaceId: string }> => {
  const sub = input.claims.sub?.trim()
  const email = input.claims.email?.trim()

  if (!sub) {
    throw new Error('Cannot provision user: missing sub claim')
  }
  if (!email) {
    throw new Error('Cannot provision user: missing email claim')
  }

  const userId = `${input.providerId}:${sub}`
  const now = new Date().toISOString()

  const existingUser = await db
    .selectFrom('users')
    .select(['id'])
    .where('id', '=', userId)
    .limit(1)
    .executeTakeFirst()

  if (!existingUser) {
    await db
      .insertInto('users')
      .values({
        id: userId,
        email,
        created_at: now,
        updated_at: now,
      })
      .execute()
  } else {
    await db
      .updateTable('users')
      .set({
        email,
        updated_at: now,
      })
      .where('id', '=', userId)
      .execute()
  }

  const existingWorkspace = await db
    .selectFrom('workspaces')
    .select(['id'])
    .where('owner_user_id', '=', userId)
    .limit(1)
    .executeTakeFirst()

  if (existingWorkspace) {
    await db
      .insertInto('workspace_members')
      .values({
        workspace_id: existingWorkspace.id,
        user_id: userId,
        role: 'owner',
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) => oc.columns(['workspace_id', 'user_id']).doNothing())
      .execute()

    return { userId, workspaceId: existingWorkspace.id }
  }

  const workspaceId = crypto.randomBytes(16).toString('base64url')

  await db
    .insertInto('workspaces')
    .values({
      id: workspaceId,
      owner_user_id: userId,
      name: 'Default',
      created_at: now,
      updated_at: now,
    })
    .execute()

  await db
    .insertInto('workspace_members')
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      role: 'owner',
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) => oc.columns(['workspace_id', 'user_id']).doNothing())
    .execute()

  return { userId, workspaceId }
}
