import { config } from './config/index.js'; // validates all env vars — throws if invalid
import { logger } from './utils/logger.js';
import { verifyConnection } from './db/supabase.js';
import { registerEventHandlers } from './events/event-handlers.js';
import { stateMachine } from './core/state-machine.js';
import { initRedis, disconnectRedis } from './locks/index.js';
import { createServer } from './dashboard/server.js';

async function main(): Promise<void> {
  logger.info('Predikt starting...');

  // 1. Verify Supabase
  await verifyConnection();

  // 2. Wire up all event subscriptions
  registerEventHandlers();

  // 3. Connect Redis (non-blocking — bot runs without it in demo mode)
  initRedis();

  // 4. Advance state machine past BOOTING
  stateMachine.transition('SYNCING');
  stateMachine.transition('READY');

  // 5. Start Express dashboard
  const { app, shutdown } = createServer();

  const server = app.listen(config.DASHBOARD_PORT, () => {
    logger.info(`Dashboard running on http://localhost:${config.DASHBOARD_PORT}`);
    logger.info(`State: ${stateMachine.state}`);
    logger.info('Bot ready. Awaiting Phase 5...');
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        `Port ${config.DASHBOARD_PORT} is already in use. Set DASHBOARD_PORT to a free port.`,
      );
    } else {
      logger.error('Server error', { message: err.message });
    }
    process.exit(1);
  });

  const handleShutdown = async (): Promise<void> => {
    logger.info('Shutdown signal received. Closing gracefully...');

    stateMachine.transition('SHUTTING_DOWN');

    await shutdown();
    await disconnectRedis();

    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout.');
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
