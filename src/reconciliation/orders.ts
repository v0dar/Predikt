import { clobClient } from '../api/clob.js';
import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import { logger } from '../utils/logger.js';
import { getOpenTrades, updateTradeStatus } from '../db/queries.js';

// Syncs DB open-order state against live CLOB reality.
// Catches orders that were cancelled or expired outside our control.
export async function reconcileOpenOrders(): Promise<void> {
  const trades = await getOpenTrades();
  const liveOrders = trades.filter((t) => t.mode === 'live' && t.order_id);

  if (liveOrders.length === 0) return;

  logger.debug(`Reconciling ${liveOrders.length} open orders against CLOB`);

  let fixed = 0;

  for (const trade of liveOrders) {
    if (!trade.order_id) continue;

    const order = await clobClient.getOrder(trade.order_id);

    if (!order) {
      // Order missing from CLOB — treat as cancelled
      await updateTradeStatus(trade.id, 'cancelled', { position_state: 'CLOSED' });
      eventBus.emit(EVENTS.ORDER_CANCELLED, {
        tradeId: trade.id,
        orderId: trade.order_id,
        marketId: trade.market_id ?? '',
      });
      logger.warn('Order missing from CLOB, marked cancelled', {
        tradeId: trade.id,
        orderId: trade.order_id,
      });
      fixed++;
      continue;
    }

    if (order.status === 'CANCELLED' && trade.status !== 'cancelled') {
      await updateTradeStatus(trade.id, 'cancelled', { position_state: 'CLOSED' });
      eventBus.emit(EVENTS.ORDER_CANCELLED, {
        tradeId: trade.id,
        orderId: trade.order_id,
        marketId: trade.market_id ?? '',
      });
      fixed++;
    } else if (order.status === 'EXPIRED' && trade.status !== 'expired') {
      await updateTradeStatus(trade.id, 'expired', { position_state: 'CLOSED' });
      fixed++;
    }
  }

  if (fixed > 0) {
    logger.info(`Order reconciliation: fixed ${fixed} discrepancies`);
  }

  eventBus.emit(EVENTS.RECONCILE_COMPLETE, {
    type: 'orders',
    processed: liveOrders.length,
    fixed,
  });
}
