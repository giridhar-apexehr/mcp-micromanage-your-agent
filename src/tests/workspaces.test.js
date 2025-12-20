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

describe('workspaces', () => {
  test('supports workspace list/create and membership management', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-workspaces-'),
    )
    const dbPath = path.join(tmpDir, 'app.sqlite')

    const originalEnv = { ...process.env }
    process.env.NODE_ENV = 'test'
    process.env.DB_DIALECT = 'sqlite'
    process.env.DB_PATH = dbPath

    let user1Id
    let user2Id
    let defaultWorkspaceId

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
        user1Id = u1.userId
        defaultWorkspaceId = u1.workspaceId

        const u2 = await provisionUserAndDefaultWorkspace(handle.db, {
          providerId: 'oidc',
          claims: { sub: 'u2', email: 'u2@example.com' },
        })
        user2Id = u2.userId
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

        const unauthRes = await fetch(`${baseUrl}/api/workspaces`)
        expect(unauthRes.status).toBe(401)

        const tokenRes = await fetch(`${baseUrl}/csrf/token`)
        expect(tokenRes.status).toBe(200)

        const cookieHeader = tokenRes.headers.get('set-cookie')
        expect(cookieHeader).toBeTruthy()

        const { token } = await tokenRes.json()
        expect(typeof token).toBe('string')

        const listRes = await fetch(`${baseUrl}/api/workspaces`, {
          headers: {
            'x-test-user-id': user1Id,
          },
        })
        expect(listRes.status).toBe(200)
        const listBody = await listRes.json()
        expect(listBody.workspaces.map((w) => w.id)).toContain(
          defaultWorkspaceId,
        )

        const createRes = await fetch(`${baseUrl}/api/workspaces`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-user-id': user1Id,
            'x-csrf-token': token,
            cookie: cookieHeader.split(';')[0],
          },
          body: JSON.stringify({ name: 'Team One' }),
        })
        expect(createRes.status).toBe(201)

        const membersBefore = await fetch(
          `${baseUrl}/api/workspaces/${defaultWorkspaceId}/members`,
          {
            headers: {
              'x-test-user-id': user1Id,
            },
          },
        )
        expect(membersBefore.status).toBe(200)

        const addRes = await fetch(
          `${baseUrl}/api/workspaces/${defaultWorkspaceId}/members`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': user1Id,
              'x-csrf-token': token,
              cookie: cookieHeader.split(';')[0],
            },
            body: JSON.stringify({ userId: user2Id, role: 'viewer' }),
          },
        )
        expect(addRes.status).toBe(201)

        const membersAfter = await fetch(
          `${baseUrl}/api/workspaces/${defaultWorkspaceId}/members`,
          {
            headers: {
              'x-test-user-id': user1Id,
            },
          },
        )
        expect(membersAfter.status).toBe(200)
        const membersBody = await membersAfter.json()
        expect(membersBody.members.map((m) => m.user_id)).toContain(user2Id)

        const deleteRes = await fetch(
          `${baseUrl}/api/workspaces/${defaultWorkspaceId}/members/${user2Id}`,
          {
            method: 'DELETE',
            headers: {
              'x-test-user-id': user1Id,
              'x-csrf-token': token,
              cookie: cookieHeader.split(';')[0],
            },
          },
        )
        expect(deleteRes.status).toBe(200)
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
