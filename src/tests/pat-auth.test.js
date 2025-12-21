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

describe('pat auth', () => {
  test('Authorization: Bearer PAT authenticates and enforces revocation + workspace binding', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-pat-auth-'),
    )
    const dbPath = path.join(tmpDir, 'app.sqlite')

    const originalEnv = { ...process.env }
    process.env.NODE_ENV = 'test'
    process.env.DB_DIALECT = 'sqlite'
    process.env.DB_PATH = dbPath

    try {
      await migrateToLatest({ dialect: 'sqlite', sqliteFilePath: dbPath })

      const handle = createDatabase({
        dialect: 'sqlite',
        sqliteFilePath: dbPath,
      })

      let userId
      let workspaceId
      let otherWorkspaceId

      const globalSecret = crypto.randomBytes(32).toString('base64url')
      const globalHash = sha256Hex(globalSecret)

      const revokedSecret = crypto.randomBytes(32).toString('base64url')
      const revokedHash = sha256Hex(revokedSecret)

      const boundSecret = crypto.randomBytes(32).toString('base64url')
      const boundHash = sha256Hex(boundSecret)

      try {
        const provisioned = await provisionUserAndDefaultWorkspace(handle.db, {
          providerId: 'oidc',
          claims: { sub: 'u1', email: 'u1@example.com' },
        })
        userId = provisioned.userId
        workspaceId = provisioned.workspaceId

        otherWorkspaceId = crypto.randomBytes(16).toString('base64url')
        const now = new Date().toISOString()

        await handle.db
          .insertInto('workspaces')
          .values({
            id: otherWorkspaceId,
            owner_user_id: userId,
            name: 'Other',
            created_at: now,
            updated_at: now,
          })
          .execute()

        await handle.db
          .insertInto('workspace_members')
          .values({
            workspace_id: otherWorkspaceId,
            user_id: userId,
            role: 'owner',
            created_at: now,
            updated_at: now,
          })
          .execute()

        await handle.db
          .insertInto('user_pats')
          .values({
            id: crypto.randomBytes(16).toString('base64url'),
            user_id: userId,
            workspace_id: null,
            name: 'global',
            secret_hash: globalHash,
            created_at: now,
            last_used_at: null,
            revoked_at: null,
          })
          .execute()

        await handle.db
          .insertInto('user_pats')
          .values({
            id: crypto.randomBytes(16).toString('base64url'),
            user_id: userId,
            workspace_id: null,
            name: 'revoked',
            secret_hash: revokedHash,
            created_at: now,
            last_used_at: null,
            revoked_at: now,
          })
          .execute()

        await handle.db
          .insertInto('user_pats')
          .values({
            id: crypto.randomBytes(16).toString('base64url'),
            user_id: userId,
            workspace_id: workspaceId,
            name: 'bound',
            secret_hash: boundHash,
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

        const invalidSecret = crypto.randomBytes(32).toString('base64url')
        const invalidRes = await fetch(`${baseUrl}/api/workspaces`, {
          headers: {
            authorization: `Bearer ${invalidSecret}`,
          },
        })
        expect(invalidRes.status).toBe(401)

        const listRes = await fetch(`${baseUrl}/api/workspaces`, {
          headers: {
            authorization: `Bearer ${globalSecret}`,
          },
        })
        expect(listRes.status).toBe(200)
        const listBody = await listRes.json()
        expect(listBody.workspaces.map((w) => w.id)).toEqual(
          expect.arrayContaining([workspaceId, otherWorkspaceId]),
        )

        const inviteRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/invites`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${globalSecret}`,
            },
            body: JSON.stringify({}),
          },
        )
        expect(inviteRes.status).toBe(201)

        const revokedRes = await fetch(`${baseUrl}/api/workspaces`, {
          headers: {
            authorization: `Bearer ${revokedSecret}`,
          },
        })
        expect(revokedRes.status).toBe(401)

        const boundListRes = await fetch(`${baseUrl}/api/workspaces`, {
          headers: {
            authorization: `Bearer ${boundSecret}`,
          },
        })
        expect(boundListRes.status).toBe(200)
        const boundListBody = await boundListRes.json()
        expect(boundListBody.workspaces.map((w) => w.id)).toEqual([workspaceId])

        const boundMismatchRes = await fetch(
          `${baseUrl}/api/workspaces/${otherWorkspaceId}/members`,
          {
            headers: {
              authorization: `Bearer ${boundSecret}`,
            },
          },
        )
        expect(boundMismatchRes.status).toBe(403)

        const boundAllowedRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/members`,
          {
            headers: {
              authorization: `Bearer ${boundSecret}`,
            },
          },
        )
        expect(boundAllowedRes.status).toBe(200)

        const createWorkspaceRes = await fetch(`${baseUrl}/api/workspaces`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${globalSecret}`,
          },
          body: JSON.stringify({ name: 'New Workspace' }),
        })
        expect(createWorkspaceRes.status).toBe(403)

        const mismatchInviteRes = await fetch(
          `${baseUrl}/api/workspaces/${otherWorkspaceId}/invites`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${globalSecret}`,
            },
            body: JSON.stringify({}),
          },
        )
        expect(mismatchInviteRes.status).toBe(201)
        const mismatchInviteBody = await mismatchInviteRes.json()
        expect(typeof mismatchInviteBody.token).toBe('string')

        const acceptMismatchInviteRes = await fetch(
          `${baseUrl}/api/invites/accept`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${boundSecret}`,
            },
            body: JSON.stringify({ token: mismatchInviteBody.token }),
          },
        )
        expect(acceptMismatchInviteRes.status).toBe(403)
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
