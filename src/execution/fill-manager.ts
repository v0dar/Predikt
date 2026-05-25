import { clobClient } from '../api/clob.js';
import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import { logger } from '../utils/logger.js';
import { getOpenTrades, upsertFill, updateTradeStatus } from '../db/queries.js';
import type { Trade } from '../db/types.js';

// ─── Fill Manager ─────────────────────────────────────────────────────────────
// Reconciles CLOB order state against open trades in DB.
// Called by the reconciliation cron — not invoked directly by the execution engine.

class FillManager {
  async checkAllOpenFills(): Promise<{ processed: number; updated: number }> {
    const openTrades = await getOpenTrades();
    const liveOrders = openTrades.filter((t) => t.mode === 'live' && t.order_id);

    if (liveOrders.length === 0) return { processed: 0, updated: 0 };

    logger.debug(`Fill manager checking ${liveOrders.length} open orders`);

    const results = await Promise.allSettled(liveOrders.map((t) => this.checkTradeFill(t)));
    const updated = results.filter((r) => r.status === 'fulfilled').length;
    return { processed: liveOrders.length, updated };
  }

  async checkTradeFill(trade: Trade): Promise<void> {
    if (!trade.order_id) return;

    const order = await clobClient.getOrder(trade.order_id);
    if (!order) return;

    const filled = parseFloat(order.size_matched);
    const original = trade.size;
    const previous = trade.size_filled ?? 0;

    if (filled <= previous) return; // No new fills

    const newFill = filled - previous;
    const remaining = original - filled;
    const isComplete = order.status === 'FILLED' || remaining <= 0.001;

    // Infer fill price from the most recent associate trade if available
    const latestTrade = order.associate_trades?.[order.associate_trades.length - 1];
    const fillPrice = latestTrade ? parseFloat(latestTrade.price) : trade.price;

    const slippage = Math.abs(fillPrice - trade.price) / trade.price;
    const fillType = isComplete ? 'complete' : 'partial';

    await upsertFill(trade.id, {
      fillSize: newFill,
      fillPrice,
      cumulativeFilled: filled,
      remainingSize: Math.max(0, remaining),
      slippage,
      fillType,
    });

    await updateTradeStatus(
      trade.id,
      isComplete ? 'filled' : 'partial',
      {
        size_filled: filled,
        size_remaining: Math.max(0, remaining),
        avg_fill_price: fillPrice,
        position_state: isComplete ? 'OPEN' : 'OPENING',
        ...(isComplete ? { filled_at: new Date().toISOString() } : {}),
      },
    );

    if (isComplete) {
      eventBus.emit(EVENTS.ORDER_FILLED, {
        tradeId: trade.id,
        orderId: trade.order_id,
        marketId: trade.market_id ?? '',
        question: trade.market_question ?? '',
        side: trade.side,
        size: filled,
        fillPrice,
      });

      logger.trade('Order fully filled', {
        tradeId: trade.id,
        orderId: trade.order_id,
        filled: `${filled.toFixed(4)} shares @ $${fillPrice.toFixed(4)}`,
        slippage: `${(slippage * 100).toFixed(2)}%`,
      });
    } else {
      eventBus.emit(EVENTS.ORDER_PARTIAL_FILL, {
        tradeId: trade.id,
        orderId: trade.order_id,
        marketId: trade.market_id ?? '',
        filled,
        remaining: Math.max(0, remaining),
        fillPrice,
      });

      logger.debug('Partial fill recorded', {
        tradeId: trade.id,
        newFill,
        cumulative: filled,
        remaining,
      });
    }
  }
}

export const fillManager = new FillManager();
