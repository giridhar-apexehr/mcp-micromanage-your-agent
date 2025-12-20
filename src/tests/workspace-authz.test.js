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

describe('workspace authz', () => {
  test('enforces access control for non-member vs viewer vs owner', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-workspace-authz-'),
    )
    const dbPath = path.join(tmpDir, 'app.sqlite')

    const originalEnv = { ...process.env }
    process.env.NODE_ENV = 'test'
    process.env.DB_DIALECT = 'sqlite'
    process.env.DB_PATH = dbPath

    let ownerUserId
    let viewerUserId
    let outsiderTargetUserId
    let outsiderNonMemberUserId
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

        const viewer = await provisionUserAndDefaultWorkspace(handle.db, {
          providerId: 'oidc',
          claims: { sub: 'viewer', email: 'viewer@example.com' },
        })
        viewerUserId = viewer.userId

        const outsiderTarget = await provisionUserAndDefaultWorkspace(
          handle.db,
          {
            providerId: 'oidc',
            claims: { sub: 'target', email: 'target@example.com' },
          },
        )
        outsiderTargetUserId = outsiderTarget.userId

        const outsiderNonMember = await provisionUserAndDefaultWorkspace(
          handle.db,
          {
            providerId: 'oidc',
            claims: { sub: 'outsider', email: 'outsider@example.com' },
          },
        )
        outsiderNonMemberUserId = outsiderNonMember.userId

        const now = new Date().toISOString()

        await handle.db
          .insertInto('workspace_members')
          .values({
            workspace_id: workspaceId,
            user_id: viewerUserId,
            role: 'viewer',
            created_at: now,
            updated_at: now,
          })
          .onConflict((oc) =>
            oc.columns(['workspace_id', 'user_id']).doNothing(),
          )
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
        expect(typeof token).toBe('string')

        const cookie = cookieHeader.split(';')[0]

        const membersUrl = `${baseUrl}/api/workspaces/${workspaceId}/members`

        const nonMemberMembersRes = await fetch(membersUrl, {
          headers: { 'x-test-user-id': outsiderNonMemberUserId },
        })
        expect(nonMemberMembersRes.status).toBe(403)

        const viewerMembersRes = await fetch(membersUrl, {
          headers: { 'x-test-user-id': viewerUserId },
        })
        expect(viewerMembersRes.status).toBe(200)

        const ownerMembersRes = await fetch(membersUrl, {
          headers: { 'x-test-user-id': ownerUserId },
        })
        expect(ownerMembersRes.status).toBe(200)

        const addMemberUrl = `${baseUrl}/api/workspaces/${workspaceId}/members`

        const nonMemberAddRes = await fetch(addMemberUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-user-id': outsiderNonMemberUserId,
            'x-csrf-token': token,
            cookie,
          },
          body: JSON.stringify({
            userId: outsiderTargetUserId,
            role: 'viewer',
          }),
        })
        expect(nonMemberAddRes.status).toBe(403)

        const viewerAddRes = await fetch(addMemberUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-user-id': viewerUserId,
            'x-csrf-token': token,
            cookie,
          },
          body: JSON.stringify({
            userId: outsiderTargetUserId,
            role: 'viewer',
          }),
        })
        expect(viewerAddRes.status).toBe(403)

        const ownerAddRes = await fetch(addMemberUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-user-id': ownerUserId,
            'x-csrf-token': token,
            cookie,
          },
          body: JSON.stringify({
            userId: outsiderTargetUserId,
            role: 'viewer',
          }),
        })
        expect(ownerAddRes.status).toBe(201)

        const inviteUrl = `${baseUrl}/api/workspaces/${workspaceId}/invites`

        const nonMemberInviteRes = await fetch(inviteUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-user-id': outsiderNonMemberUserId,
            'x-csrf-token': token,
            cookie,
          },
          body: JSON.stringify({}),
        })
        expect(nonMemberInviteRes.status).toBe(403)

        const viewerInviteRes = await fetch(inviteUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-user-id': viewerUserId,
            'x-csrf-token': token,
            cookie,
          },
          body: JSON.stringify({}),
        })
        expect(viewerInviteRes.status).toBe(403)

        const ownerInviteRes = await fetch(inviteUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-test-user-id': ownerUserId,
            'x-csrf-token': token,
            cookie,
          },
          body: JSON.stringify({}),
        })
        expect(ownerInviteRes.status).toBe(201)

        const removeUrl = `${baseUrl}/api/workspaces/${workspaceId}/members/${outsiderTargetUserId}`

        const viewerRemoveRes = await fetch(removeUrl, {
          method: 'DELETE',
          headers: {
            'x-test-user-id': viewerUserId,
            'x-csrf-token': token,
            cookie,
          },
        })
        expect(viewerRemoveRes.status).toBe(403)

        const nonMemberRemoveRes = await fetch(removeUrl, {
          method: 'DELETE',
          headers: {
            'x-test-user-id': outsiderNonMemberUserId,
            'x-csrf-token': token,
            cookie,
          },
        })
        expect(nonMemberRemoveRes.status).toBe(403)

        const ownerRemoveRes = await fetch(removeUrl, {
          method: 'DELETE',
          headers: {
            'x-test-user-id': ownerUserId,
            'x-csrf-token': token,
            cookie,
          },
        })
        expect(ownerRemoveRes.status).toBe(200)
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
