import { signer } from '../wallet/signer.js';
import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import { logger } from '../utils/logger.js';
import { upsertBotStatus, getSetting } from '../db/queries.js';
import { getAllSettings } from '../config/index.js';
import { config } from '../config/index.js';

// Syncs USDC and MATIC balances from chain/settings into bot_status.
export async function reconcileBalances(): Promise<void> {
  const settings = await getAllSettings();
  let usdcBalance = 0;
  let maticBalance = 0;

  if (settings.MODE === 'demo') {
    const raw = await getSetting('DEMO_CURRENT_BALANCE');
    usdcBalance = parseFloat(raw ?? '500');
  } else if (config.PRIVATE_KEY) {
    try {
      [usdcBalance, maticBalance] = await Promise.all([
        signer.getUsdcBalance(),
        signer.getMaticBalance(),
      ]);
    } catch (err) {
      logger.warn('Balance fetch failed during reconciliation', {
        error: (err as Error).message,
      });
    }
  }

  await upsertBotStatus({ usdc_balance: usdcBalance, matic_balance: maticBalance });

  // Threshold alerts (live mode only)
  if (settings.MODE === 'live' && config.PRIVATE_KEY) {
    if (usdcBalance < settings.MAX_BET_USD * 2) {
      eventBus.emit(EVENTS.WALLET_LOW_BALANCE, {
        balance: usdcBalance,
        minimum: settings.MAX_BET_USD * 2,
      });
    }
    if (maticBalance < settings.MIN_MATIC_BALANCE) {
      eventBus.emit(EVENTS.WALLET_LOW_MATIC, {
        balance: maticBalance,
        minimum: settings.MIN_MATIC_BALANCE,
      });
    }
  }

  logger.debug('Balance reconciliation complete', {
    usdc: `$${usdcBalance.toFixed(2)}`,
    matic: `${maticBalance.toFixed(4)}`,
    mode: settings.MODE,
  });

  eventBus.emit(EVENTS.RECONCILE_COMPLETE, { type: 'balances', processed: 1, fixed: 0 });
}
