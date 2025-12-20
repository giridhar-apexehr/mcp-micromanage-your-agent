import fs from 'fs'
import path from 'path'

import Database from 'better-sqlite3'
import { SqliteDialect } from 'kysely'

import type { DatabaseAdapter } from './types.js'
import type { DatabaseConfig } from '../config.js'

const ensureParentDir = (filePath: string): void => {
  const dirPath = path.dirname(filePath)
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export const createSqliteAdapter = (
  config: DatabaseConfig,
): DatabaseAdapter => {
  if (config.dialect !== 'sqlite') {
    throw new Error(`Invalid config for sqlite adapter: ${config.dialect}`)
  }

  ensureParentDir(config.sqliteFilePath)

  const dbFile = new Database(config.sqliteFilePath)
  dbFile.pragma('foreign_keys = ON')

  return {
    dialect: 'sqlite',
    createDialect: () => new SqliteDialect({ database: dbFile }),
    destroy: async () => {
      dbFile.close()
    },
  }
}
