import { spawn } from 'child_process'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'

const pickFreePort = async () => {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()

    server.once('error', reject)

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to pick ephemeral port'))
          return
        }
        resolve(address.port)
      })
    })
  })
}

const sleep = async (ms) => {
  await new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    t.unref()
  })
}

const waitForReady = async ({
  baseUrl,
  child,
  stdout,
  stderr,
  timeoutMs = 15_000,
}) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(
        `Server exited before ready (code=${child.exitCode}).\nstdout:\n${stdout}\nstderr:\n${stderr}`,
      )
    }

    try {
      const res = await fetch(`${baseUrl}/readyz`)
      if (res.status === 200) return
    } catch {
      // server not listening yet
    }

    await sleep(100)
  }

  try {
    child.kill('SIGTERM')
  } catch {
    // ignore
  }

  throw new Error(
    `Timed out waiting for /readyz to become ready at ${baseUrl}.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  )
}

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
    const port = await pickFreePort()
    const baseUrl = `http://127.0.0.1:${port}`

    const env = {
      ...process.env,
      HTTP_HOST: '127.0.0.1',
      HTTP_PORT: String(port),
      LOG_LEVEL: 'NONE',
      DB_DIALECT: 'sqlite',
      DB_PATH: dbPath,
    }

    const child = spawn('node', ['dist/server/index.js'], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })

    try {
      await waitForReady({ baseUrl, child, stdout, stderr, timeoutMs: 15_000 })

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
