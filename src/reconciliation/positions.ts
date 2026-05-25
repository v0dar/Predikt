import { polymarket } from '../api/polymarket.js';
import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import { logger } from '../utils/logger.js';
import {
  getFilledPendingTrades,
  getDemoOpenTrades,
  resolveTrade,
  resolveDemoTrade,
  incrementDemoBalance,
} from '../db/queries.js';

// ─── PnL helpers ──────────────────────────────────────────────────────────────
// In a binary prediction market you pay $size at price p:
//   Win:  receive size/p USDC  →  PnL = size*(1-p)/p
//   Loss: receive $0          →  PnL = -size

function calcPnl(size: number, price: number, won: boolean): number {
  if (won) return parseFloat((size * (1 - price) / price).toFixed(6));
  return -size;
}

// ─── Live position resolution ─────────────────────────────────────────────────

async function reconcileLivePositions(): Promise<number> {
  const trades = await getFilledPendingTrades();
  let resolved = 0;

  for (const trade of trades) {
    if (!trade.market_id) continue;

    const resolution = await polymarket.getMarketResolution(trade.market_id);
    if (!resolution) continue;

    const entryPrice = trade.avg_fill_price ?? trade.price;
    const won =
      resolution !== 'INVALID' &&
      ((trade.side === 'YES' && resolution === 'YES') ||
       (trade.side === 'NO' && resolution === 'NO'));

    const outcome = won ? 'win' : 'loss';
    const pnl = resolution === 'INVALID' ? 0 : calcPnl(trade.size, entryPrice, won);

    await resolveTrade(trade.id, outcome, pnl);

    eventBus.emit(EVENTS.POSITION_CLOSED, {
      tradeId: trade.id,
      marketId: trade.market_id,
      question: trade.market_question ?? '',
      pnl,
      outcome,
      holdTimeMs: trade.filled_at
        ? Date.now() - new Date(trade.filled_at).getTime()
        : 0,
    });

    logger.trade('Live position resolved', {
      tradeId: trade.id,
      outcome,
      pnl: `$${pnl.toFixed(2)}`,
      resolution,
    });

    resolved++;
  }

  return resolved;
}

// ─── Demo position resolution ─────────────────────────────────────────────────

async function reconcileDemoPositions(): Promise<number> {
  const trades = await getDemoOpenTrades();
  let resolved = 0;

  for (const trade of trades) {
    if (!trade.market_id) continue;

    const resolution = await polymarket.getMarketResolution(trade.market_id);
    if (!resolution) continue;

    const won =
      resolution !== 'INVALID' &&
      ((trade.side === 'YES' && resolution === 'YES') ||
       (trade.side === 'NO' && resolution === 'NO'));

    const outcome = won ? 'win' : 'loss';
    const pnl = resolution === 'INVALID' ? 0 : calcPnl(trade.size, trade.price, won);

    await resolveDemoTrade(trade.id, outcome, pnl);

    // On win: add payout back to virtual balance (loss was already deducted on placement)
    if (won) {
      const payout = trade.size + pnl; // cost + profit = total payout
      await incrementDemoBalance(payout);
    }

    logger.info('Demo position resolved', {
      tradeId: trade.id,
      market: trade.market_question,
      outcome,
      pnl: `$${pnl.toFixed(2)}`,
    });

    resolved++;
  }

  return resolved;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function reconcilePositions(): Promise<void> {
  const [live, demo] = await Promise.all([
    reconcileLivePositions(),
    reconcileDemoPositions(),
  ]);

  const total = live + demo;
  if (total > 0) {
    logger.info(`Position reconciliation: resolved ${live} live, ${demo} demo`);
  }

  eventBus.emit(EVENTS.RECONCILE_COMPLETE, {
    type: 'positions',
    processed: total,
    fixed: total,
  });
}
