#!/usr/bin/env node

import http from 'http'

import logger from '../utils/logger.js'
import { loadHttpServerConfig } from './config.js'
import { createApp } from './app.js'
import { migrateToLatest } from './db/migrator.js'

const config = loadHttpServerConfig()
logger.setLogLevel(config.logLevel)
logger.info(`HTTP logger initialized with level: ${config.logLevel}`)

const app = createApp(config)
const server = http.createServer(app)

const shutdown = (signal: string): void => {
  logger.info(`Received ${signal}, shutting down HTTP server...`)
  server.close(() => {
    logger.info('HTTP server closed')
    process.exit(0)
  })

  setTimeout(() => {
    logger.error('HTTP server forced shutdown after timeout')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

const run = async (): Promise<void> => {
  try {
    await migrateToLatest()

    server.listen(config.port, config.host, () => {
      const addr = server.address()
      if (addr && typeof addr !== 'string') {
        logger.info(
          `HTTP server listening on http://${addr.address}:${addr.port}`,
        )
        return
      }
      logger.info(
        `HTTP server listening on http://${config.host}:${config.port}`,
      )
    })
  } catch (error) {
    logger.logError('HTTP server startup failed', error)
    process.exit(1)
  }
}

void run()
