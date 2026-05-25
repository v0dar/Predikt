import { fillManager } from '../execution/fill-manager.js';
import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import { logger } from '../utils/logger.js';

// Scheduled fill reconciliation — delegates to fill-manager for the actual logic.
// Catches any fills that were missed between execution-time checks.
export async function reconcileFills(): Promise<void> {
  logger.debug('Fill reconciliation starting');

  const { processed, updated } = await fillManager.checkAllOpenFills();

  eventBus.emit(EVENTS.RECONCILE_COMPLETE, {
    type: 'fills',
    processed,
    fixed: updated,
  });
}
