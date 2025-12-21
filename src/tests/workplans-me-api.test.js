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

describe('/api/me workplans', () => {
  test('infers workspace, returns 409 on ambiguity, 404 on missing, and 403 on insufficient role', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-workplans-me-'),
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
    let workspaceId2
    let workspaceViewer

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
        workspaceId2 = crypto.randomBytes(16).toString('base64url')
        workspaceViewer = crypto.randomBytes(16).toString('base64url')

        await handle.db
          .insertInto('workspaces')
          .values({
            id: workspaceId2,
            owner_user_id: userId,
            name: 'Second',
            created_at: now,
            updated_at: now,
          })
          .execute()

        await handle.db
          .insertInto('workspace_members')
          .values({
            workspace_id: workspaceId2,
            user_id: userId,
            role: 'owner',
            created_at: now,
            updated_at: now,
          })
          .execute()

        await handle.db
          .insertInto('workspaces')
          .values({
            id: workspaceViewer,
            owner_user_id: userId,
            name: 'Viewer',
            created_at: now,
            updated_at: now,
          })
          .execute()

        await handle.db
          .insertInto('workspace_members')
          .values({
            workspace_id: workspaceViewer,
            user_id: userId,
            role: 'viewer',
            created_at: now,
            updated_at: now,
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

        const planRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-single/plan`,
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
              prPlans: [{ goal: 'PR', commitPlans: [{ goal: 'C1' }] }],
            }),
          },
        )
        expect(planRes.status).toBe(200)

        const expectedSinglePath = path.join(
          workplansDir,
          workspaceId,
          'wp-single.json',
        )
        expect(fs.existsSync(expectedSinglePath)).toBe(true)

        const trackSingle = await fetch(
          `${baseUrl}/api/me/workplans/wp-single/track`,
          {
            headers: {
              'x-test-user-id': userId,
            },
          },
        )
        if (trackSingle.status !== 200) {
          const body = await trackSingle.text()
          throw new Error(`trackSingle failed (${trackSingle.status}): ${body}`)
        }
        const trackSingleBody = await trackSingle.json()
        expect(trackSingleBody.goal).toBe('Goal')

        const planResA = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-amb/plan`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': userId,
              'x-csrf-token': token,
              cookie,
            },
            body: JSON.stringify({
              goal: 'Amb',
              prPlans: [{ goal: 'PR', commitPlans: [{ goal: 'C1' }] }],
            }),
          },
        )
        expect(planResA.status).toBe(200)

        const planResB = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId2}/workplans/wp-amb/plan`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': userId,
              'x-csrf-token': token,
              cookie,
            },
            body: JSON.stringify({
              goal: 'Amb2',
              prPlans: [{ goal: 'PR', commitPlans: [{ goal: 'C1' }] }],
            }),
          },
        )
        expect(planResB.status).toBe(200)

        const trackAmb = await fetch(
          `${baseUrl}/api/me/workplans/wp-amb/track`,
          {
            headers: {
              'x-test-user-id': userId,
            },
          },
        )
        expect(trackAmb.status).toBe(409)
        const trackAmbBody = await trackAmb.json()
        expect(Array.isArray(trackAmbBody.workspaceIds)).toBe(true)
        expect(trackAmbBody.workspaceIds.length).toBe(2)

        const trackMissing = await fetch(
          `${baseUrl}/api/me/workplans/does-not-exist/track`,
          {
            headers: {
              'x-test-user-id': userId,
            },
          },
        )
        expect(trackMissing.status).toBe(404)

        const viewerDir = path.join(workplansDir, workspaceViewer)
        fs.mkdirSync(viewerDir, { recursive: true })
        fs.writeFileSync(
          path.join(viewerDir, 'wp-view.json'),
          JSON.stringify({ goal: 'Viewer goal', pullRequests: [] }),
          'utf8',
        )

        const planViewer = await fetch(
          `${baseUrl}/api/me/workplans/wp-view/plan`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': userId,
              'x-csrf-token': token,
              cookie,
            },
            body: JSON.stringify({
              goal: 'New goal',
              prPlans: [{ goal: 'PR', commitPlans: [{ goal: 'C1' }] }],
            }),
          },
        )
        expect(planViewer.status).toBe(403)
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
