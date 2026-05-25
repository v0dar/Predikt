import { polymarket } from '../api/polymarket.js';
import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import { logger } from '../utils/logger.js';
import { getOpenTrades, getFilledPendingTrades, updateTradeStatus } from '../db/queries.js';

// Detects and handles disputed or invalidated market resolutions.
// Runs hourly. Complements reconcilePositions() — that handles clean resolutions,
// this handles edge cases: markets past end_date with no clear winner.
export async function reconcileMarketState(): Promise<void> {
  const [openTrades, filledTrades] = await Promise.all([
    getOpenTrades(),
    getFilledPendingTrades(),
  ]);

  const candidates = [...openTrades, ...filledTrades].filter(
    (t) => t.market_id && t.mode === 'live',
  );

  if (candidates.length === 0) return;

  let disputed = 0;
  let invalidated = 0;

  for (const trade of candidates) {
    if (!trade.market_id) continue;

    const market = await polymarket.getMarket(trade.market_id);
    if (!market) continue;

    const isPastEnd = market.endDate && market.endDate < new Date();
    if (!isPastEnd) continue;

    const resolution = await polymarket.getMarketResolution(trade.market_id);

    if (resolution === 'INVALID') {
      // Market voided — return cost basis, no profit/loss
      await updateTradeStatus(trade.id, trade.status, {
        resolution_status: 'invalidated',
        dispute_notes: 'Market resolved as INVALID by oracle',
      });

      eventBus.emit(EVENTS.POSITION_INVALIDATED, {
        tradeId: trade.id,
        marketId: trade.market_id,
      });

      logger.warn('Market invalidated, position voided', {
        tradeId: trade.id,
        marketId: trade.market_id,
      });

      invalidated++;
    } else if (resolution === null && !market.active) {
      // Past end_date, market inactive, no resolution — likely a dispute
      if (trade.resolution_status !== 'disputed') {
        await updateTradeStatus(trade.id, trade.status, {
          resolution_status: 'disputed',
          dispute_notes: `Market past end_date (${market.endDate?.toISOString()}) with no resolution`,
        });

        eventBus.emit(EVENTS.POSITION_DISPUTED, {
          tradeId: trade.id,
          marketId: trade.market_id,
          notes: 'Market ended without resolution — possible dispute',
        });

        logger.warn('Possible market dispute detected', {
          tradeId: trade.id,
          marketId: trade.market_id,
          endDate: market.endDate,
        });

        disputed++;
      }
    }
  }

  if (disputed > 0 || invalidated > 0) {
    logger.info(`Market state reconciliation: ${disputed} disputed, ${invalidated} invalidated`);
  }
}
