import type { DatabaseAdapter } from './types.js';
import type { DatabaseConfig } from '../config.js';

export const createPostgresAdapter = (_config: DatabaseConfig): DatabaseAdapter => {
  return {
    dialect: 'postgres',
    createDialect: () => {
      throw new Error('Postgres adapter not implemented yet');
    },
    destroy: async () => {},
  };
};
