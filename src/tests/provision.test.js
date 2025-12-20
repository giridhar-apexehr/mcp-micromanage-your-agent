import fs from 'fs'
import os from 'os'
import path from 'path'

import { migrateToLatest } from '../../dist/server/db/migrator.js'
import { createDatabase, destroyDatabase } from '../../dist/server/db/index.js'
import { provisionUserAndDefaultWorkspace } from '../../dist/server/auth/provision.js'

const restoreEnv = (snapshot) => {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key]
    }
  }

  for (const [key, value] of Object.entries(snapshot)) {
    process.env[key] = value
  }
}

describe('provisioning', () => {
  test('provisions user + default workspace on first login and is idempotent', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-provision-'),
    )
    const dbPath = path.join(tmpDir, 'app.sqlite')

    const originalEnv = { ...process.env }
    process.env.DB_DIALECT = 'sqlite'
    process.env.DB_PATH = dbPath

    try {
      await migrateToLatest({ dialect: 'sqlite', sqliteFilePath: dbPath })

      const handle = createDatabase({
        dialect: 'sqlite',
        sqliteFilePath: dbPath,
      })

      try {
        await provisionUserAndDefaultWorkspace(handle.db, {
          providerId: 'oidc',
          claims: { sub: 'abc', email: 'abc@example.com' },
        })

        await provisionUserAndDefaultWorkspace(handle.db, {
          providerId: 'oidc',
          claims: { sub: 'abc', email: 'abc@example.com' },
        })

        const users = await handle.db
          .selectFrom('users')
          .select(['id'])
          .execute()

        const workspaces = await handle.db
          .selectFrom('workspaces')
          .select(['id', 'owner_user_id'])
          .execute()

        expect(users).toHaveLength(1)
        expect(users[0].id).toBe('oidc:abc')

        expect(workspaces).toHaveLength(1)
        expect(workspaces[0].owner_user_id).toBe('oidc:abc')
      } finally {
        await destroyDatabase(handle)
      }
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
