export type DatabaseDialect = 'sqlite' | 'postgres'

export type DatabaseConfig =
  | {
      dialect: 'sqlite'
      sqliteFilePath: string
    }
  | {
      dialect: 'postgres'
      databaseUrl: string
    }

const normalizeDialect = (value: string | undefined): DatabaseDialect => {
  const raw = (value ?? 'sqlite').trim().toLowerCase()
  if (raw === 'postgres' || raw === 'postgresql') return 'postgres'
  return 'sqlite'
}

export const loadDatabaseConfig = (): DatabaseConfig => {
  const dialect = normalizeDialect(
    process.env.DB_DIALECT ?? process.env.DATABASE_DIALECT,
  )

  if (dialect === 'postgres') {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required when DB_DIALECT=postgres')
    }

    return { dialect: 'postgres', databaseUrl }
  }

  const sqliteFilePath =
    process.env.DB_PATH ??
    process.env.SQLITE_PATH ??
    process.env.DATABASE_URL ??
    './data/app.sqlite'

  return { dialect: 'sqlite', sqliteFilePath }
}
