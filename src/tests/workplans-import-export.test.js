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

describe('workplans import/export', () => {
  test('exports a versioned payload and imports into a new workplan', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-workplans-import-export-'),
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
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-src/plan`,
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
                  commitPlans: [{ goal: 'C1' }],
                },
              ],
            }),
          },
        )
        expect(planRes.status).toBe(200)

        const expectedPath = path.join(workplansDir, workspaceId, 'wp-src.json')
        expect(fs.existsSync(expectedPath)).toBe(true)

        const exportRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-src/export`,
          {
            headers: {
              'x-test-user-id': userId,
            },
          },
        )
        if (exportRes.status !== 200) {
          const body = await exportRes.text()
          throw new Error(`export failed (${exportRes.status}): ${body}`)
        }
        const exportBody = await exportRes.json()
        expect(exportBody.version).toBe('workplan-export-v1')
        expect(exportBody.workplanId).toBe('wp-src')
        expect(exportBody.workplan.goal).toBe('Goal')

        const importRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/import`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': userId,
              'x-csrf-token': token,
              cookie,
            },
            body: JSON.stringify({
              version: exportBody.version,
              workplanId: 'wp-dst',
              workplan: exportBody.workplan,
            }),
          },
        )
        expect(importRes.status).toBe(201)

        const getRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/wp-dst`,
          {
            headers: {
              'x-test-user-id': userId,
            },
          },
        )
        expect(getRes.status).toBe(200)
        const getBody = await getRes.json()
        expect(getBody.workplan.goal).toBe('Goal')

        const importConflictRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/import`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': userId,
              'x-csrf-token': token,
              cookie,
            },
            body: JSON.stringify({
              version: exportBody.version,
              workplanId: 'wp-dst',
              workplan: exportBody.workplan,
            }),
          },
        )
        expect(importConflictRes.status).toBe(409)

        const badVersionRes = await fetch(
          `${baseUrl}/api/workspaces/${workspaceId}/workplans/import`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-test-user-id': userId,
              'x-csrf-token': token,
              cookie,
            },
            body: JSON.stringify({
              version: 'nope',
              workplanId: 'wp-bad',
              workplan: exportBody.workplan,
            }),
          },
        )
        expect(badVersionRes.status).toBe(400)
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
