import type { Kysely } from 'kysely'

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema
    .createTable('workspaces')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('owner_user_id', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addForeignKeyConstraint(
      'workspaces_owner_user_id_fk',
      ['owner_user_id'],
      'users',
      ['id'],
      (cb) => cb.onDelete('cascade'),
    )
    .execute()

  await db.schema
    .createIndex('workspaces_owner_user_id_idx')
    .on('workspaces')
    .column('owner_user_id')
    .execute()
}

export const down = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema.dropTable('workspaces').execute()
}
