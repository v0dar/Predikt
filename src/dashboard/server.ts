import express, { Request, Response, NextFunction, Express } from 'express';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { apiRouter } from './routes/api.js';
import { pagesRouter } from './routes/pages.js';
import { authRouter } from './routes/auth.js';

// Always resolve public dir from project root — works in both tsx dev and tsup prod
const publicDir = join(process.cwd(), 'src', 'dashboard', 'public');

interface ServerInstance {
  app: Express;
  shutdown: () => Promise<void>;
}

export function createServer(): ServerInstance {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static assets (HTML, CSS, JS, SVGs)
  app.use(express.static(publicDir));

  // ─── Health (unauthenticated) ─────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ─── Auth routes (Telegram callback, profile provision) ──────────────────
  app.use('/auth', authRouter);

  // ─── API routes ───────────────────────────────────────────────────────────
  app.use('/api', apiRouter);

  // ─── Page routes ──────────────────────────────────────────────────────────
  app.use('/', pagesRouter);

  // ─── Error handler ────────────────────────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Dashboard unhandled error', { message: err.message });
    res.status(500).json({
      error: 'Internal server error',
      message: process.env['NODE_ENV'] === 'development' ? err.message : undefined,
    });
  });

  // ─── 404 ─────────────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  const shutdown = async (): Promise<void> => {
    logger.info('Dashboard Express shutting down');
  };

  return { app, shutdown };
}
