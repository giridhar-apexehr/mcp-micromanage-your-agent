import { LogLevel } from '../utils/logger.js'

export type HttpServerConfig = {
  host: string
  port: number
  corsOrigin: string | boolean
  logLevel: LogLevel
}

const parseIntegerEnv = (
  value: string | undefined,
  fallback: number,
): number => {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseLogLevel = (
  value: string | undefined,
  fallback: LogLevel,
): LogLevel => {
  if (!value) return fallback
  const normalized = value.trim().toUpperCase()
  switch (normalized) {
    case 'DEBUG':
      return LogLevel.DEBUG
    case 'INFO':
      return LogLevel.INFO
    case 'WARN':
    case 'WARNING':
      return LogLevel.WARN
    case 'ERROR':
      return LogLevel.ERROR
    case 'NONE':
      return LogLevel.NONE
    default:
      return fallback
  }
}

const parseCorsOrigin = (value: string | undefined): string | boolean => {
  if (!value) return true
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return value
}

export const loadHttpServerConfig = (): HttpServerConfig => {
  return {
    host: process.env.HTTP_HOST ?? '127.0.0.1',
    port: parseIntegerEnv(process.env.HTTP_PORT, 8787),
    corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
    logLevel: parseLogLevel(process.env.LOG_LEVEL, LogLevel.INFO),
  }
}
