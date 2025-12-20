import crypto from 'node:crypto'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'

import { createApp } from '../../dist/server/app.js'
import { provisionUserAndDefaultWorkspace } from '../../dist/server/auth/provision.js'
import { migrateToLatest } from '../../dist/server/db/migrator.js'
import { createDatabase, destroyDatabase } from '../../dist/server/db/index.js'

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

describe('workspace invites', () => {
  test('owner can create invite; accept adds membership; reuse and expiry are rejected', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-invites-'),
    )
    const dbPath = path.join(tmpDir, 'app.sqlite')

    const originalEnv = { ...process.env }
    process.env.NODE_ENV = 'test'
    process.env.DB_DIALECT = 'sqlite'
    process.env.DB_PATH = dbPath

    let ownerUserId
    let inviteeUserId
    let workspaceId

    try {
      await migrateToLatest({ dialect: 'sqlite', sqliteFilePath: dbPath })

      const handle = createDatabase({
        dialect: 'sqlite',
        sqliteFilePath: dbPath,
      })

      try {
        const owner = await provisionUserAndDefaultWorkspace(handle.db, {
          providerId: 'oidc',
          claims: { sub: 'owner', email: 'owner@example.com' },
        })
        ownerUserId = owner.userId
        workspaceId = owner.workspaceId

        const invitee = await provisionUserAndDefaultWorkspace(handle.db, {
          providerId: 'oidc',
          claims: { sub: 'invitee', email: 'invitee@example.com' },
        })
        inviteeUserId = invitee.userId
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

        const tokenRes = await fetch(`${baseUrl}/csrf/token`)
        expect(tokenRes.status).toBe(200)

        const cookieHeader = tokenRes.headers.get('set-cookie')
        expect(cookieHeader).toBeTruthy()

        const { token } = await tokenRes.json()
        expect(typeof token).toBe('string')

        const createInviteRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/invites`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': ownerUserId,
              'x-csrf-token': token,
              cookie: cookieHeader.split(';')[0],
            },
            body: JSON.stringify({}),
          },
        )

        expect(createInviteRes.status).toBe(201)
        const inviteBody = await createInviteRes.json()
        expect(typeof inviteBody.token).toBe('string')
        expect(inviteBody.role).toBe('viewer')
        expect(typeof inviteBody.expiresAt).toBe('string')

        const acceptRes = await fetch(`${baseUrl}/api/invites/accept`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-user-id': inviteeUserId,
            'x-csrf-token': token,
            cookie: cookieHeader.split(';')[0],
          },
          body: JSON.stringify({ token: inviteBody.token }),
        })

        expect(acceptRes.status).toBe(200)

        const membersAfter = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/members`,
          {
            headers: {
              'x-test-user-id': ownerUserId,
            },
          },
        )
        expect(membersAfter.status).toBe(200)
        const membersBody = await membersAfter.json()
        expect(membersBody.members.map((m) => m.user_id)).toContain(
          inviteeUserId,
        )

        const reuseRes = await fetch(`${baseUrl}/api/invites/accept`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-user-id': inviteeUserId,
            'x-csrf-token': token,
            cookie: cookieHeader.split(';')[0],
          },
          body: JSON.stringify({ token: inviteBody.token }),
        })

        expect(reuseRes.status).toBe(400)

        const createInviteRes2 = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/invites`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': ownerUserId,
              'x-csrf-token': token,
              cookie: cookieHeader.split(';')[0],
            },
            body: JSON.stringify({}),
          },
        )

        expect(createInviteRes2.status).toBe(201)
        const inviteBody2 = await createInviteRes2.json()

        const handle2 = createDatabase({
          dialect: 'sqlite',
          sqliteFilePath: dbPath,
        })

        try {
          const tokenHash2 = sha256Hex(inviteBody2.token)
          await handle2.db
            .updateTable('workspace_invites')
            .set({ expires_at: new Date(0).toISOString() })
            .where('token_hash', '=', tokenHash2)
            .execute()
        } finally {
          await destroyDatabase(handle2)
        }

        const expiredRes = await fetch(`${baseUrl}/api/invites/accept`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-user-id': inviteeUserId,
            'x-csrf-token': token,
            cookie: cookieHeader.split(';')[0],
          },
          body: JSON.stringify({ token: inviteBody2.token }),
        })

        expect(expiredRes.status).toBe(400)
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
