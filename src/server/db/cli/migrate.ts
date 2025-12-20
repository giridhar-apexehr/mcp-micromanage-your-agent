#!/usr/bin/env node

import logger from '../../../utils/logger.js'
import { loadDatabaseConfig } from '../config.js'
import { migrateToLatest } from '../migrator.js'

const run = async (): Promise<void> => {
  try {
    const config = loadDatabaseConfig()
    await migrateToLatest(config)
    logger.info('Database migrations applied')
  } catch (error) {
    logger.logError('Database migration failed', error)
    process.exit(1)
  }
}

run()
