import express, { Request, Response, NextFunction, Express } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ServerInstance {
  app: Express;
  shutdown: () => Promise<void>;
}

export function createServer(): ServerInstance {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve static dashboard files
  app.use(express.static(join(__dirname, 'public')));

  // ─── Health Check ────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ─── Centralised Error Handler ───────────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Dashboard] Unhandled error:', err.message);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env['NODE_ENV'] === 'development' ? err.message : undefined,
    });
  });

  // ─── 404 Handler ────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  const shutdown = async (): Promise<void> => {
    console.log('[Dashboard] Express shutting down...');
    // Redis and Supabase teardown will be added in later phases
  };

  return { app, shutdown };
}
