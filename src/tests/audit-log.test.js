import crypto from 'node:crypto'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'

import { createApp } from '../../dist/server/app.js'
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

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address === 'string') {
        resolve({ address: '127.0.0.1', port: 0 })
        return
      }
      resolve(address)
    })
  })

const sha256Hex = (value) => {
  return crypto.createHash('sha256').update(value).digest('hex')
}

describe('audit log', () => {
  test('writes audit events for PAT-authenticated write endpoints', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-audit-log-'),
    )
    const dbPath = path.join(tmpDir, 'app.sqlite')

    const originalEnv = { ...process.env }
    process.env.NODE_ENV = 'test'
    process.env.DB_DIALECT = 'sqlite'
    process.env.DB_PATH = dbPath

    const patSecret = crypto.randomBytes(32).toString('base64url')
    const patHash = sha256Hex(patSecret)
    const patId = crypto.randomBytes(16).toString('base64url')

    let userId
    let workspaceId

    try {
      await migrateToLatest({ dialect: 'sqlite', sqliteFilePath: dbPath })

      const handle = createDatabase({
        dialect: 'sqlite',
        sqliteFilePath: dbPath,
      })

      try {
        const provisioned = await provisionUserAndDefaultWorkspace(handle.db, {
          providerId: 'oidc',
          claims: { sub: 'u1', email: 'u1@example.com' },
        })
        userId = provisioned.userId
        workspaceId = provisioned.workspaceId

        const now = new Date().toISOString()

        await handle.db
          .insertInto('user_pats')
          .values({
            id: patId,
            user_id: userId,
            workspace_id: null,
            name: 'test',
            secret_hash: patHash,
            created_at: now,
            last_used_at: null,
            revoked_at: null,
          })
          .execute()
      } finally {
        await destroyDatabase(handle)
      }

      const app = createApp({
        host: '127.0.0.1',
        port: 0,
        corsOrigin: true,
        logLevel: 4,
      })
      const server = http.createServer(app)

      try {
        const address = await listen(server)
        const baseUrl = `http://${address.address}:${address.port}`

        const inviteRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/invites`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${patSecret}`,
            },
            body: JSON.stringify({}),
          },
        )
        expect(inviteRes.status).toBe(201)

        const inviteBody = await inviteRes.json()
        expect(typeof inviteBody.token).toBe('string')

        const handle2 = createDatabase({
          dialect: 'sqlite',
          sqliteFilePath: dbPath,
        })

        try {
          const events = await handle2.db
            .selectFrom('audit_log')
            .select([
              'actor_user_id',
              'actor_pat_id',
              'workspace_id',
              'action',
              'resource_type',
            ])
            .where('actor_user_id', '=', userId)
            .execute()

          const inviteEvent = events.find(
            (e) => e.action === 'workspace_invites.create',
          )
          expect(inviteEvent).toBeTruthy()
          expect(inviteEvent.actor_pat_id).toBe(patId)
          expect(inviteEvent.workspace_id).toBe(workspaceId)
          expect(inviteEvent.resource_type).toBe('workspace_invite')
        } finally {
          await destroyDatabase(handle2)
        }
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
