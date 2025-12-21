import type { Kysely } from 'kysely'

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema
    .createTable('user_pats')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) => col.notNull())
    .addColumn('workspace_id', 'text')
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('secret_hash', 'text', (col) => col.notNull().unique())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('last_used_at', 'text')
    .addColumn('revoked_at', 'text')
    .addForeignKeyConstraint(
      'user_pats_user_fk',
      ['user_id'],
      'users',
      ['id'],
      (cb) => cb.onDelete('cascade'),
    )
    .addForeignKeyConstraint(
      'user_pats_workspace_fk',
      ['workspace_id'],
      'workspaces',
      ['id'],
      (cb) => cb.onDelete('set null'),
    )
    .execute()

  await db.schema
    .createIndex('user_pats_user_id_idx')
    .on('user_pats')
    .column('user_id')
    .execute()

  await db.schema
    .createIndex('user_pats_workspace_id_idx')
    .on('user_pats')
    .column('workspace_id')
    .execute()
}

export const down = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema.dropTable('user_pats').execute()
}
