import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

import { createApp } from '../../dist/server/app.js';
import { migrateToLatest } from '../../dist/server/db/migrator.js';

const restoreEnv = (snapshot) => {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(snapshot)) {
    process.env[key] = value;
  }
};

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'string') {
        resolve({ address: '127.0.0.1', port: 0 });
        return;
      }
      resolve(address);
    });
  });

describe('health endpoints', () => {
  test('/healthz and /readyz return 200 when DB is ready', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-micromanage-health-'));
    const dbPath = path.join(tmpDir, 'app.sqlite');

    const originalEnv = { ...process.env };
    process.env.DB_DIALECT = 'sqlite';
    process.env.DB_PATH = dbPath;

    try {
      await migrateToLatest({ dialect: 'sqlite', sqliteFilePath: dbPath });

      const app = createApp({ host: '127.0.0.1', port: 0, corsOrigin: true, logLevel: 4 });
      const server = http.createServer(app);

      try {
        const address = await listen(server);
        const baseUrl = `http://${address.address}:${address.port}`;

        const healthRes = await fetch(`${baseUrl}/healthz`);
        expect(healthRes.status).toBe(200);

        const readyRes = await fetch(`${baseUrl}/readyz`);
        expect(readyRes.status).toBe(200);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    } finally {
      restoreEnv(originalEnv);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('/readyz returns 503 when DB is not ready', async () => {
    const originalEnv = { ...process.env };
    process.env.DB_DIALECT = 'postgres';
    delete process.env.DATABASE_URL;

    try {
      const app = createApp({ host: '127.0.0.1', port: 0, corsOrigin: true, logLevel: 4 });
      const server = http.createServer(app);

      try {
        const address = await listen(server);
        const baseUrl = `http://${address.address}:${address.port}`;

        const readyRes = await fetch(`${baseUrl}/readyz`);
        expect(readyRes.status).toBe(503);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    } finally {
      restoreEnv(originalEnv);
    }
  });
});
