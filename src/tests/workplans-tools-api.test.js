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

describe('workplans tool endpoints', () => {
  test('plan/track/update/insert-commit work on file-backed workplan under lock', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-workplans-tools-'),
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

        const now = new Date().toISOString()

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

        const planBody = {
          goal: 'Top goal',
          prPlans: [
            {
              goal: 'PR1',
              commitPlans: [{ goal: 'C1' }],
            },
          ],
        }

        const planRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-tools/plan`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': userId,
              'x-csrf-token': token,
              cookie,
            },
            body: JSON.stringify(planBody),
          },
        )
        expect(planRes.status).toBe(200)

        const trackRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-tools/track`,
          {
            headers: {
              'x-test-user-id': userId,
            },
          },
        )
        expect(trackRes.status).toBe(200)
        const trackBody = await trackRes.json()
        expect(trackBody.goal).toBe('Top goal')
        expect(trackBody.progress.prs).toBe('0/1')

        const updateNeedsRefRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-tools/update`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': userId,
              'x-csrf-token': token,
              cookie,
            },
            body: JSON.stringify({
              prIndex: 0,
              commitIndex: 0,
              status: 'needsRefinment',
            }),
          },
        )
        expect(updateNeedsRefRes.status).toBe(200)

        const updateInProgressRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-tools/update`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': userId,
              'x-csrf-token': token,
              cookie,
            },
            body: JSON.stringify({
              prIndex: 0,
              commitIndex: 0,
              status: 'in_progress',
            }),
          },
        )
        expect(updateInProgressRes.status).toBe(200)

        const insertRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-tools/insert-commit`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': userId,
              'x-csrf-token': token,
              cookie,
            },
            body: JSON.stringify({
              prIndex: 0,
              insertAfterCommitIndex: 0,
              goal: 'C2',
            }),
          },
        )
        expect(insertRes.status).toBe(200)
        const insertBody = await insertRes.json()
        expect(insertBody.insertedCommitIndex).toBe(1)

        const trackRes2 = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-tools/track`,
          {
            headers: {
              authorization: `Bearer ${patSecret}`,
            },
          },
        )
        expect(trackRes2.status).toBe(200)
        const trackBody2 = await trackRes2.json()
        expect(trackBody2.goal).toBe('Top goal')

        const patPlanRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-tools-pat/plan`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${patSecret}`,
            },
            body: JSON.stringify(planBody),
          },
        )
        expect(patPlanRes.status).toBe(200)
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
