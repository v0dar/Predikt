import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { stateMachine } from './core/state-machine.js';
import { bootstrap } from './core/bootstrap.js';
import { startScheduler } from './scheduler/jobs.js';
import { disconnectRedis } from './locks/index.js';
import { createServer } from './dashboard/server.js';
import { upsertBotStatus } from './db/queries.js';

async function main(): Promise<void> {
  logger.info('Predikt starting...');

  // 1. Bootstrap: verify DB, wire events, init Redis, BOOTING → SYNCING → READY
  await bootstrap();

  // 2. Start scheduler (cron jobs + immediate first scan)
  const scheduler = await startScheduler();

  // 3. Start dashboard
  const { app, shutdown } = createServer();

  const server = app.listen(config.DASHBOARD_PORT, () => {
    logger.info(`Dashboard running on http://localhost:${config.DASHBOARD_PORT}`);
    logger.info(`Bot state: ${stateMachine.state}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        `Port ${config.DASHBOARD_PORT} already in use. Set a different DASHBOARD_PORT in .env`,
      );
    } else {
      logger.error('Server error', { message: err.message });
    }
    process.exit(1);
  });

  // 4. Graceful shutdown
  const handleShutdown = async (): Promise<void> => {
    logger.info('Shutdown signal received — closing gracefully');

    scheduler.stop();

    try {
      stateMachine.transition('SHUTTING_DOWN');
    } catch {
      // May already be in EMERGENCY_STOPPED
    }

    await upsertBotStatus({ state: 'SHUTTING_DOWN', running: false });

    await shutdown();
    await disconnectRedis();

    server.close(() => {
      logger.info('Server closed. Goodbye.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after 10s timeout.');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => void handleShutdown());
  process.on('SIGINT', () => void handleShutdown());
}

main().catch((err: unknown) => {
  console.error('[Predikt] Fatal startup error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
