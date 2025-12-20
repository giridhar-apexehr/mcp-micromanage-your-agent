import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import logger from '../utils/logger.js';
import type { HttpServerConfig } from './config.js';

export const createApp = (config: HttpServerConfig): express.Express => {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(cors({ origin: config.corsOrigin }));

  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.logError('HTTP request error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
};
