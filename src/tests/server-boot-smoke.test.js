import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const waitForListeningUrl = (child, timeoutMs = 15_000) =>
  new Promise((resolve, reject) => {
    let buffer = ''

    const timeout = setTimeout(() => {
      try {
        child.kill('SIGTERM')
      } catch {
        // ignore
      }
      cleanup()
      reject(
        new Error(`Timed out waiting for server to start. Output:\n${buffer}`),
      )
    }, timeoutMs)
    timeout.unref()

    const onData = (chunk) => {
      buffer += chunk.toString('utf8')

      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const match = line.match(/HTTP server listening on (http:\/\/\S+)/)
        if (match) {
          cleanup()
          resolve(match[1])
          return
        }
      }
    }

    const onExit = (code, signal) => {
      cleanup()
      reject(
        new Error(
          `Server exited before ready (code=${code}, signal=${signal}). Output:\n${buffer}`,
        ),
      )
    }

    const cleanup = () => {
      clearTimeout(timeout)
      child.stderr?.off('data', onData)
      child.stdout?.off('data', onData)
      child.off('exit', onExit)
    }

    child.stderr?.on('data', onData)
    child.stdout?.on('data', onData)
    child.on('exit', onExit)
  })

const shutdownChild = (child) =>
  new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve()
      return
    }

    const timeout = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
    }, 5_000)
    timeout.unref()

    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })

    try {
      child.kill('SIGTERM')
    } catch {
      clearTimeout(timeout)
      resolve()
    }
  })

describe('server boot smoke', () => {
  test('boots, runs migrations, and serves /healthz and /readyz', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-server-'),
    )
    const dbPath = path.join(tmpDir, 'app.sqlite')

    const env = {
      ...process.env,
      HTTP_HOST: '127.0.0.1',
      HTTP_PORT: '0',
      LOG_LEVEL: 'INFO',
      DB_DIALECT: 'sqlite',
      DB_PATH: dbPath,
    }

    const child = spawn('node', ['dist/server/index.js'], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    try {
      const baseUrl = await waitForListeningUrl(child)

      const healthRes = await fetch(`${baseUrl}/healthz`)
      expect(healthRes.status).toBe(200)

      const readyRes = await fetch(`${baseUrl}/readyz`)
      expect(readyRes.status).toBe(200)
    } finally {
      await shutdownChild(child)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 20_000)
})
