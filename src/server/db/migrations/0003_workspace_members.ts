import { sql, type Kysely } from 'kysely'

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema
    .createTable('workspace_members')
    .addColumn('workspace_id', 'text', (col) => col.notNull())
    .addColumn('user_id', 'text', (col) => col.notNull())
    .addColumn('role', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('workspace_members_pk', [
      'workspace_id',
      'user_id',
    ])
    .addForeignKeyConstraint(
      'workspace_members_workspace_fk',
      ['workspace_id'],
      'workspaces',
      ['id'],
      (cb) => cb.onDelete('cascade'),
    )
    .addForeignKeyConstraint(
      'workspace_members_user_fk',
      ['user_id'],
      'users',
      ['id'],
      (cb) => cb.onDelete('cascade'),
    )
    .execute()

  await db.schema
    .createIndex('workspace_members_user_id_idx')
    .on('workspace_members')
    .column('user_id')
    .execute()

  await db.schema
    .createIndex('workspace_members_workspace_id_idx')
    .on('workspace_members')
    .column('workspace_id')
    .execute()

  await sql`
    insert into workspace_members (
      workspace_id,
      user_id,
      role,
      created_at,
      updated_at
    )
    select
      id,
      owner_user_id,
      'owner',
      created_at,
      updated_at
    from workspaces
  `.execute(db)
}

export const down = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema.dropTable('workspace_members').execute()
}
