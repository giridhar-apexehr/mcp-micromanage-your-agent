import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

import { FileMigrationProvider, Migrator } from 'kysely';

import { createDatabase, destroyDatabase } from './index.js';
import { loadDatabaseConfig, type DatabaseConfig } from './config.js';

const getMigrationsFolder = (): string => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, 'migrations');
};

export const migrateToLatest = async (config?: DatabaseConfig): Promise<void> => {
  const resolved = config ?? loadDatabaseConfig();
  const handle = createDatabase(resolved);

  try {
    const provider = new FileMigrationProvider({
      fs,
      path,
      migrationFolder: getMigrationsFolder(),
    });

    const migrator = new Migrator({
      db: handle.db,
      provider,
    });

    const { error } = await migrator.migrateToLatest();

    if (error) throw error;
  } finally {
    await destroyDatabase(handle);
  }
};
