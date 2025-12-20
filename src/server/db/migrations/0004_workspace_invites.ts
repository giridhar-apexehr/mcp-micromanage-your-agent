import type { Kysely } from 'kysely'

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema
    .createTable('workspace_invites')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('workspace_id', 'text', (col) => col.notNull())
    .addColumn('created_by_user_id', 'text', (col) => col.notNull())
    .addColumn('role', 'text', (col) => col.notNull())
    .addColumn('token_hash', 'text', (col) => col.notNull().unique())
    .addColumn('expires_at', 'text', (col) => col.notNull())
    .addColumn('used_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addForeignKeyConstraint(
      'workspace_invites_workspace_fk',
      ['workspace_id'],
      'workspaces',
      ['id'],
      (cb) => cb.onDelete('cascade'),
    )
    .addForeignKeyConstraint(
      'workspace_invites_created_by_fk',
      ['created_by_user_id'],
      'users',
      ['id'],
      (cb) => cb.onDelete('cascade'),
    )
    .execute()

  await db.schema
    .createIndex('workspace_invites_workspace_id_idx')
    .on('workspace_invites')
    .column('workspace_id')
    .execute()

  await db.schema
    .createIndex('workspace_invites_expires_at_idx')
    .on('workspace_invites')
    .column('expires_at')
    .execute()
}

export const down = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema.dropTable('workspace_invites').execute()
}
