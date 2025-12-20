import http from 'http'

import { createApp } from '../../dist/server/app.js'

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

describe('auth config', () => {
  test('/auth/providers returns configured and missingConfigKeys based on env', async () => {
    const originalEnv = { ...process.env }
    process.env.NODE_ENV = 'test'
    delete process.env.AUTH_PROVIDERS
    delete process.env.AUTH_PROVIDER

    delete process.env.OIDC_ISSUER_URL
    delete process.env.OIDC_CLIENT_ID
    delete process.env.OIDC_CLIENT_SECRET

    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET

    try {
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

        const res = await fetch(`${baseUrl}/auth/providers`)
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(Array.isArray(body.providers)).toBe(true)

        const oidc = body.providers.find((p) => p.id === 'oidc')
        const google = body.providers.find((p) => p.id === 'google')

        expect(oidc).toBeTruthy()
        expect(google).toBeTruthy()

        expect(oidc.configured).toBe(false)
        expect(oidc.missingConfigKeys).toEqual(
          expect.arrayContaining([
            'OIDC_ISSUER_URL',
            'OIDC_CLIENT_ID',
            'OIDC_CLIENT_SECRET',
          ]),
        )

        expect(google.configured).toBe(false)
        expect(google.missingConfigKeys).toEqual(
          expect.arrayContaining(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']),
        )
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
    }
  })

  test('/auth/providers respects AUTH_PROVIDERS allowlist', async () => {
    const originalEnv = { ...process.env }
    process.env.NODE_ENV = 'test'
    process.env.AUTH_PROVIDERS = 'google'

    try {
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

        const res = await fetch(`${baseUrl}/auth/providers`)
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.providers.map((p) => p.id)).toEqual(['google'])
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
    }
  })

  test('/auth/:provider/login redirects to failure URL when provider is misconfigured', async () => {
    const originalEnv = { ...process.env }
    process.env.NODE_ENV = 'test'
    process.env.UI_BASE_URL = 'http://localhost:5173'
    process.env.AUTH_PROVIDERS = 'oidc'

    delete process.env.OIDC_ISSUER_URL
    delete process.env.OIDC_CLIENT_ID
    delete process.env.OIDC_CLIENT_SECRET

    try {
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

        const res = await fetch(`${baseUrl}/auth/oidc/login`, {
          redirect: 'manual',
        })

        expect(res.status).toBeGreaterThanOrEqual(300)
        expect(res.status).toBeLessThan(400)

        const location = res.headers.get('location')
        expect(location).toBeTruthy()
        expect(location.startsWith('http://localhost:5173/login')).toBe(true)
        expect(location).toContain('error=')
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      restoreEnv(originalEnv)
    }
  })
})
