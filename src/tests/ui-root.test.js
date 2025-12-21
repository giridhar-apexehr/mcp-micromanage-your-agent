import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

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

describe('UI served at root', () => {
  test("'/' is 404 when dist/ui/index.html is missing and /ui stays 404", async () => {
    const serverEntryPath = fileURLToPath(
      new URL('../../dist/server/app.js', import.meta.url),
    )
    const uiDir = path.resolve(path.dirname(serverEntryPath), '../ui')
    const backupDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-ui-backup-'),
    )

    const hadUi = fs.existsSync(uiDir)
    if (hadUi) {
      fs.cpSync(uiDir, backupDir, { recursive: true })
    }
    fs.rmSync(uiDir, { recursive: true, force: true })

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

      const rootRes = await fetch(`${baseUrl}/`, {
        headers: { accept: 'text/html' },
      })
      expect(rootRes.status).toBe(404)

      const uiRes = await fetch(`${baseUrl}/ui`, {
        headers: { accept: 'text/html' },
      })
      expect(uiRes.status).toBe(404)
    } finally {
      await new Promise((resolve) => server.close(resolve))
      fs.rmSync(uiDir, { recursive: true, force: true })
      if (hadUi) {
        fs.cpSync(backupDir, uiDir, { recursive: true })
      }
      fs.rmSync(backupDir, { recursive: true, force: true })
    }
  })

  test("'/' serves HTML when dist/ui/index.html exists, but /ui stays 404", async () => {
    const serverEntryPath = fileURLToPath(
      new URL('../../dist/server/app.js', import.meta.url),
    )
    const uiDir = path.resolve(path.dirname(serverEntryPath), '../ui')
    const uiIndex = path.join(uiDir, 'index.html')

    const backupDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-ui-backup-'),
    )

    const hadUi = fs.existsSync(uiDir)
    if (hadUi) {
      fs.cpSync(uiDir, backupDir, { recursive: true })
    }

    fs.mkdirSync(uiDir, { recursive: true })
    fs.writeFileSync(
      uiIndex,
      '<!doctype html><html><head><title>UI</title></head><body>UI</body></html>',
      'utf8',
    )

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

      const rootRes = await fetch(`${baseUrl}/`, {
        headers: { accept: 'text/html' },
      })
      expect(rootRes.status).toBe(200)
      const html = await rootRes.text()
      expect(html.includes('<title>UI</title>')).toBe(true)

      const uiRes = await fetch(`${baseUrl}/ui`, {
        headers: { accept: 'text/html' },
      })
      expect(uiRes.status).toBe(404)
    } finally {
      await new Promise((resolve) => server.close(resolve))
      fs.rmSync(uiDir, { recursive: true, force: true })
      if (hadUi) {
        fs.cpSync(backupDir, uiDir, { recursive: true })
      }
      fs.rmSync(backupDir, { recursive: true, force: true })
    }
  })
})
