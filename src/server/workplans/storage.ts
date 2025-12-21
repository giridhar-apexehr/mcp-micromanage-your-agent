import fs from 'node:fs'
import path from 'node:path'

import {
  acquireFileLock,
  ensureDirectoryExists,
  releaseFileLock,
  writeJsonAtomic,
} from '../../utils/fileStorage.js'

const getWorkplanDataDir = (): string => {
  const raw = process.env.WORKPLAN_DATA_DIR
  const dir =
    typeof raw === 'string' && raw.trim() ? raw.trim() : './data/workplans'
  return dir
}

const validateId = (label: string, value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required`)
  }

  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new Error(`${label} contains invalid characters`)
  }

  return trimmed
}

const safeResolve = (rootDir: string, relativePath: string): string => {
  const rootAbs = path.resolve(rootDir)
  const resolved = path.resolve(rootAbs, relativePath)

  const rel = path.relative(rootAbs, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path traversal detected')
  }

  return resolved
}

export const resolveWorkspaceBaseDir = (workspaceId: string): string => {
  const ws = validateId('workspaceId', workspaceId)
  const root = getWorkplanDataDir()

  return safeResolve(root, ws)
}

export const resolveWorkplanPath = (
  workspaceId: string,
  workplanId: string,
): string => {
  const wsDir = resolveWorkspaceBaseDir(workspaceId)
  const wp = validateId('workplanId', workplanId)

  return safeResolve(wsDir, `${wp}.json`)
}

export const readWorkplanJson = <T>(
  workspaceId: string,
  workplanId: string,
): T | undefined => {
  const filePath = resolveWorkplanPath(workspaceId, workplanId)
  if (!fs.existsSync(filePath)) return undefined

  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw) as T
}

export const writeWorkplanJsonAtomic = (
  workspaceId: string,
  workplanId: string,
  data: unknown,
): boolean => {
  const filePath = resolveWorkplanPath(workspaceId, workplanId)
  ensureDirectoryExists(path.dirname(filePath))

  return writeJsonAtomic(filePath, data)
}

export const withWorkplanLock = <T>(
  workspaceId: string,
  workplanId: string,
  fn: () => T,
): T => {
  const filePath = resolveWorkplanPath(workspaceId, workplanId)
  const lockPath = `${filePath}.lock`

  const handle = acquireFileLock(lockPath)
  try {
    return fn()
  } finally {
    releaseFileLock(handle)
  }
}
