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

describe('workplans concurrency', () => {
  test('concurrent updates still result in only one in_progress commit', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-workplans-concurrency-'),
    )
    const dbPath = path.join(tmpDir, 'app.sqlite')
    const workplansDir = path.join(tmpDir, 'workplans')

    const originalEnv = { ...process.env }
    process.env.NODE_ENV = 'test'
    process.env.DB_DIALECT = 'sqlite'
    process.env.DB_PATH = dbPath
    process.env.WORKPLAN_DATA_DIR = workplansDir

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

        const planRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-concurrency/plan`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': userId,
              'x-csrf-token': token,
              cookie,
            },
            body: JSON.stringify({
              goal: 'Goal',
              prPlans: [
                {
                  goal: 'PR1',
                  commitPlans: [{ goal: 'C1' }, { goal: 'C2' }],
                },
              ],
            }),
          },
        )
        expect(planRes.status).toBe(200)

        const toNeedsRef = async (commitIndex) => {
          const res = await fetch(
            `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-concurrency/update`,
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
                commitIndex,
                status: 'needsRefinment',
              }),
            },
          )
          expect(res.status).toBe(200)
        }

        await toNeedsRef(0)
        await toNeedsRef(1)

        const toInProgress = (commitIndex) =>
          fetch(
            `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-concurrency/update`,
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
                commitIndex,
                status: 'in_progress',
              }),
            },
          )

        const [r1, r2] = await Promise.all([toInProgress(0), toInProgress(1)])
        expect([r1.status, r2.status]).toEqual(
          expect.arrayContaining([200, 200]),
        )

        const trackRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-concurrency/track`,
          {
            headers: {
              'x-test-user-id': userId,
            },
          },
        )
        expect(trackRes.status).toBe(200)

        const trackBody = await trackRes.json()
        const commits = trackBody.detailedPullRequests?.[0]?.commits
        expect(Array.isArray(commits)).toBe(true)

        const inProgressCount = commits.filter(
          (c) => c.status === 'in_progress',
        ).length
        expect(inProgressCount).toBe(1)
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
