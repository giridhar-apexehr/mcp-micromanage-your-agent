import { Kysely } from 'kysely'

import type { DB } from './types.js'
import type { DatabaseAdapter } from './adapters/types.js'
import { loadDatabaseConfig, type DatabaseConfig } from './config.js'
import { createSqliteAdapter } from './adapters/sqlite.js'
import { createPostgresAdapter } from './adapters/postgres.js'

export type DatabaseHandle = {
  db: Kysely<DB>
  adapter: DatabaseAdapter
}

export const createDatabase = (config?: DatabaseConfig): DatabaseHandle => {
  const resolved = config ?? loadDatabaseConfig()

  const adapter =
    resolved.dialect === 'sqlite'
      ? createSqliteAdapter(resolved)
      : createPostgresAdapter(resolved)

  const db = new Kysely<DB>({
    dialect: adapter.createDialect(),
  })

  return { db, adapter }
}

export const destroyDatabase = async (
  handle: DatabaseHandle,
): Promise<void> => {
  await handle.db.destroy()
  await handle.adapter.destroy()
}
