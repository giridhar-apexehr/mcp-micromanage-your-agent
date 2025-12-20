import type { Dialect } from 'kysely'
import type { DatabaseDialect, DatabaseConfig } from '../config.js'

export type DatabaseAdapter = {
  dialect: DatabaseDialect
  createDialect: () => Dialect
  destroy: () => Promise<void>
}

export type CreateAdapter = (config: DatabaseConfig) => DatabaseAdapter
