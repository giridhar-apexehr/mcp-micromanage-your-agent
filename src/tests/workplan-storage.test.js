import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  readWorkplanJson,
  resolveWorkplanPath,
  resolveWorkspaceBaseDir,
  withWorkplanLock,
  writeWorkplanJsonAtomic,
} from '../../dist/server/workplans/storage.js'

import {
  acquireFileLock,
  releaseFileLock,
} from '../../dist/utils/fileStorage.js'

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

describe('workplan storage', () => {
  test('writeWorkplanJsonAtomic + readWorkplanJson roundtrip', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-workplan-storage-'),
    )

    const originalEnv = { ...process.env }
    process.env.WORKPLAN_DATA_DIR = tmpDir

    try {
      const ok = writeWorkplanJsonAtomic('ws1', 'wp1', { hello: 'world' })
      expect(ok).toBe(true)

      const readBack = readWorkplanJson('ws1', 'wp1')
      expect(readBack).toEqual({ hello: 'world' })

      const workspaceDir = resolveWorkspaceBaseDir('ws1')
      expect(workspaceDir).toBe(path.join(tmpDir, 'ws1'))

      const filePath = resolveWorkplanPath('ws1', 'wp1')
      expect(filePath).toBe(path.join(tmpDir, 'ws1', 'wp1.json'))
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('workplan lock is exclusive', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-workplan-lock-'),
    )

    const originalEnv = { ...process.env }
    process.env.WORKPLAN_DATA_DIR = tmpDir

    try {
      const filePath = resolveWorkplanPath('ws1', 'wp1')
      const lockPath = `${filePath}.lock`

      const handle = acquireFileLock(lockPath)
      try {
        expect(() => acquireFileLock(lockPath, { retries: 0 })).toThrow()
      } finally {
        releaseFileLock(handle)
      }

      expect(() =>
        withWorkplanLock('ws1', 'wp1', () => {
          return 'ok'
        }),
      ).not.toThrow()
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('rejects path traversal in ids', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-micromanage-workplan-traversal-'),
    )

    const originalEnv = { ...process.env }
    process.env.WORKPLAN_DATA_DIR = tmpDir

    try {
      expect(() => resolveWorkplanPath('ws1', '../evil')).toThrow()
      expect(() => resolveWorkplanPath('../ws', 'wp1')).toThrow()
      expect(() => resolveWorkplanPath('ws1', 'wp/1')).toThrow()
    } finally {
      restoreEnv(originalEnv)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
