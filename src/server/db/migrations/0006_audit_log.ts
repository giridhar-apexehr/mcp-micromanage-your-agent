import type { Kysely } from 'kysely'

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema
    .createTable('audit_log')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('at', 'text', (col) => col.notNull())
    .addColumn('actor_user_id', 'text', (col) => col.notNull())
    .addColumn('actor_pat_id', 'text')
    .addColumn('workspace_id', 'text')
    .addColumn('action', 'text', (col) => col.notNull())
    .addColumn('resource_type', 'text', (col) => col.notNull())
    .addColumn('resource_id', 'text')
    .addColumn('metadata_json', 'text')
    .execute()

  await db.schema
    .createIndex('audit_log_at_idx')
    .on('audit_log')
    .column('at')
    .execute()

  await db.schema
    .createIndex('audit_log_actor_user_id_idx')
    .on('audit_log')
    .column('actor_user_id')
    .execute()

  await db.schema
    .createIndex('audit_log_workspace_id_idx')
    .on('audit_log')
    .column('workspace_id')
    .execute()
}

export const down = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema.dropTable('audit_log').execute()
}
