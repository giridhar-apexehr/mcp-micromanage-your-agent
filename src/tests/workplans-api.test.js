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

describe('workplans API', () => {
  test('create/list/get workplans (session+csrf) and supports PAT auth with workspace binding', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-workplans-api-'),
    )
    const dbPath = path.join(tmpDir, 'app.sqlite')
    const workplansDir = path.join(tmpDir, 'workplans')

    const originalEnv = { ...process.env }
    process.env.NODE_ENV = 'test'
    process.env.DB_DIALECT = 'sqlite'
    process.env.DB_PATH = dbPath
    process.env.WORKPLAN_DATA_DIR = workplansDir

    const patSecret = crypto.randomBytes(32).toString('base64url')
    const patHash = sha256Hex(patSecret)
    const patId = crypto.randomBytes(16).toString('base64url')

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
            id: patId,
            user_id: userId,
            workspace_id: workspaceId,
            name: 'bound',
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

        const tokenRes = await fetch(`${baseUrl}/csrf/token`)
        expect(tokenRes.status).toBe(200)

        const cookieHeader = tokenRes.headers.get('set-cookie')
        expect(cookieHeader).toBeTruthy()

        const { token } = await tokenRes.json()
        const cookie = cookieHeader.split(';')[0]

        const createRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': userId,
              'x-csrf-token': token,
              cookie,
            },
            body: JSON.stringify({ workplanId: 'wp1', goal: 'Goal 1' }),
          },
        )
        expect(createRes.status).toBe(201)

        const createBadRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': userId,
              'x-csrf-token': token,
              cookie,
            },
            body: JSON.stringify({ workplanId: '../bad', goal: 'Nope' }),
          },
        )
        expect(createBadRes.status).toBe(400)

        const listRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans`,
          {
            headers: {
              'x-test-user-id': userId,
            },
          },
        )
        expect(listRes.status).toBe(200)
        const listBody = await listRes.json()
        expect(Array.isArray(listBody.workplans)).toBe(true)
        const found = listBody.workplans.find((w) => w.id === 'wp1')
        expect(found).toBeTruthy()
        expect(found.goal).toBe('Goal 1')
        expect(found.prCount).toBe(0)
        expect(found.commitCount).toBe(0)

        const getRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp1`,
          {
            headers: {
              'x-test-user-id': userId,
            },
          },
        )
        expect(getRes.status).toBe(200)
        const getBody = await getRes.json()
        expect(getBody.workplan.goal).toBe('Goal 1')
        expect(Array.isArray(getBody.workplan.pullRequests)).toBe(true)

        const patCreateRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${patSecret}`,
            },
            body: JSON.stringify({ workplanId: 'wp2', goal: 'Goal 2' }),
          },
        )
        expect(patCreateRes.status).toBe(201)

        const patMismatchRes = await fetch(
          `${baseUrl}/api/workspaces/${otherWorkspaceId}/workplans`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${patSecret}`,
            },
            body: JSON.stringify({ workplanId: 'wp3', goal: 'Goal 3' }),
          },
        )
        expect(patMismatchRes.status).toBe(403)
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
