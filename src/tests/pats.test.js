import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'

import { createApp } from '../../dist/server/app.js'
import { provisionUserAndDefaultWorkspace } from '../../dist/server/auth/provision.js'
import { createDatabase, destroyDatabase } from '../../dist/server/db/index.js'
import { migrateToLatest } from '../../dist/server/db/migrator.js'

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

describe('pats', () => {
  test('supports create/list/revoke and enforces workspace scoping', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-pats-'),
    )
    const dbPath = path.join(tmpDir, 'app.sqlite')

    const originalEnv = { ...process.env }
    process.env.NODE_ENV = 'test'
    process.env.DB_DIALECT = 'sqlite'
    process.env.DB_PATH = dbPath

    let userId
    let workspaceId
    let otherWorkspaceId

    try {
      await migrateToLatest({ dialect: 'sqlite', sqliteFilePath: dbPath })

      const handle = createDatabase({
        dialect: 'sqlite',
        sqliteFilePath: dbPath,
      })

      try {
        const u1 = await provisionUserAndDefaultWorkspace(handle.db, {
          providerId: 'oidc',
          claims: { sub: 'u1', email: 'u1@example.com' },
        })
        userId = u1.userId
        workspaceId = u1.workspaceId

        const u2 = await provisionUserAndDefaultWorkspace(handle.db, {
          providerId: 'oidc',
          claims: { sub: 'u2', email: 'u2@example.com' },
        })
        otherWorkspaceId = u2.workspaceId
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

        const unauthRes = await fetch(`${baseUrl}/api/pats`)
        expect(unauthRes.status).toBe(401)

        const tokenRes = await fetch(`${baseUrl}/csrf/token`)
        expect(tokenRes.status).toBe(200)

        const cookieHeader = tokenRes.headers.get('set-cookie')
        expect(cookieHeader).toBeTruthy()

        const { token } = await tokenRes.json()
        const cookie = cookieHeader.split(';')[0]

        const createRes = await fetch(`${baseUrl}/api/pats`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-user-id': userId,
            'x-csrf-token': token,
            cookie,
          },
          body: JSON.stringify({ name: 'my key', workspaceId }),
        })
        expect(createRes.status).toBe(201)

        const createBody = await createRes.json()
        expect(typeof createBody.id).toBe('string')
        expect(typeof createBody.secret).toBe('string')
        expect(createBody.secret.length).toBeGreaterThan(20)

        const listRes = await fetch(`${baseUrl}/api/pats`, {
          headers: {
            'x-test-user-id': userId,
          },
        })
        expect(listRes.status).toBe(200)

        const listBody = await listRes.json()
        expect(Array.isArray(listBody.pats)).toBe(true)

        const created = listBody.pats.find((p) => p.id === createBody.id)
        expect(created).toBeTruthy()
        expect(created.name).toBe('my key')
        expect(created.secret).toBeUndefined()

        const revokeRes = await fetch(`${baseUrl}/api/pats/${createBody.id}`, {
          method: 'DELETE',
          headers: {
            'x-test-user-id': userId,
            'x-csrf-token': token,
            cookie,
          },
        })
        expect(revokeRes.status).toBe(200)

        const listRes2 = await fetch(`${baseUrl}/api/pats`, {
          headers: {
            'x-test-user-id': userId,
          },
        })
        expect(listRes2.status).toBe(200)

        const listBody2 = await listRes2.json()
        const revoked = listBody2.pats.find((p) => p.id === createBody.id)
        expect(revoked).toBeTruthy()
        expect(revoked.revoked_at).toBeTruthy()

        const forbiddenCreateRes = await fetch(`${baseUrl}/api/pats`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-user-id': userId,
            'x-csrf-token': token,
            cookie,
          },
          body: JSON.stringify({ name: 'bad', workspaceId: otherWorkspaceId }),
        })
        expect(forbiddenCreateRes.status).toBe(403)
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
