import http from 'http'

import { createApp } from '../../dist/server/app.js'

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

describe('csrf', () => {
  test('blocks unsafe requests without csrf token and allows with token + session cookie', async () => {
    const app = createApp({
      host: '127.0.0.1',
      port: 0,
      corsOrigin: true,
      logLevel: 4,
    })

    app.post('/csrf-test', (_req, res) => {
      res.status(200).json({ ok: true })
    })

    const server = http.createServer(app)

    try {
      const address = await listen(server)
      const baseUrl = `http://${address.address}:${address.port}`

      const noTokenRes = await fetch(`${baseUrl}/csrf-test`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      expect(noTokenRes.status).toBe(403)

      const tokenRes = await fetch(`${baseUrl}/csrf/token`)
      expect(tokenRes.status).toBe(200)

      const cookieHeader = tokenRes.headers.get('set-cookie')
      expect(cookieHeader).toBeTruthy()

      const { token } = await tokenRes.json()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(10)

      const csrfRes = await fetch(`${baseUrl}/csrf-test`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': token,
          cookie: cookieHeader.split(';')[0],
        },
        body: JSON.stringify({}),
      })
      expect(csrfRes.status).toBe(200)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
