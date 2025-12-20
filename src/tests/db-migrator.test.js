import fs from 'fs'
import os from 'os'
import path from 'path'

import { migrateToLatest } from '../../dist/server/db/migrator.js'
import { createDatabase, destroyDatabase } from '../../dist/server/db/index.js'

describe('db migrator', () => {
  test('migrateToLatest creates tables and allows querying via Kysely', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-micromanage-db-'))
    const dbPath = path.join(tmpDir, 'app.sqlite')

    try {
      await migrateToLatest({ dialect: 'sqlite', sqliteFilePath: dbPath })

      const handle = createDatabase({
        dialect: 'sqlite',
        sqliteFilePath: dbPath,
      })
      try {
        const rows = await handle.db
          .selectFrom('users')
          .select(['id'])
          .execute()
        expect(Array.isArray(rows)).toBe(true)
      } finally {
        await destroyDatabase(handle)
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
