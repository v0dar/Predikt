import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { verifyConnection } from '../db/supabase.js';
import { registerEventHandlers } from '../events/event-handlers.js';
import { stateMachine } from './state-machine.js';
import { initRedis } from '../locks/index.js';
import { upsertBotStatus } from '../db/queries.js';
import { reconcileBalances } from '../reconciliation/balances.js';

// Startup sequence: BOOTING → SYNCING → READY
// Any failure here aborts startup — the bot won't trade in an unknown state.
export async function bootstrap(): Promise<void> {
  logger.info('Bootstrap starting', { version: '1.0.0', env: config.NODE_ENV });

  // 1. Database connectivity
  await verifyConnection();
  logger.info('Supabase connection verified');

  // 2. Event bus wiring
  registerEventHandlers();
  logger.info('Event handlers registered');

  // 3. Redis + distributed locking (non-fatal — bot degrades gracefully without it)
  initRedis();

  // 4. Advance state machine
  stateMachine.transition('SYNCING');

  await upsertBotStatus({
    state: 'SYNCING',
    running: true,
    dry_run: !config.PRIVATE_KEY,
    mode: 'demo', // overwritten by settings once scan cycle reads them
  });

  // 5. Initial balance sync
  await reconcileBalances();

  // 6. Mark ready
  stateMachine.transition('READY');

  await upsertBotStatus({
    state: 'READY',
    running: true,
  });

  logger.info('Bootstrap complete — bot is READY');
}
