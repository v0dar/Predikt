// ─── Backtesting Fill Simulator ───────────────────────────────────────────────
// Given a trade intent and the market's historical snapshots, determines whether
// the trade would have been filled and at what outcome.

import type { TradeIntent } from '../strategy/sandbox.js';
import type { MarketSnapshot } from '../db/types.js';
import { calcTradePnl } from './metrics.js';
import type { BacktestTrade } from './metrics.js';

export interface SimulationResult {
  filled:        boolean;
  fillPrice:     number;
  slippage:      number;   // fraction (0.02 = 2%)
  trade:         BacktestTrade | null;
  skipReason:    string | null;
}

// Max slippage we allow in simulation — mirrors risk engine default
const MAX_SLIPPAGE = 0.03; // 3%

// ─── Single-trade simulation ──────────────────────────────────────────────────

export function simulateFill(
  intent: TradeIntent,
  entrySnapshot: MarketSnapshot,
  futureSnapshots: MarketSnapshot[], // same marketId, chronologically sorted
): SimulationResult {

  // 1. Determine best available price from snapshot order book
  const bookPrice = intent.side === 'YES'
    ? (entrySnapshot.best_ask ?? entrySnapshot.yes_price)
    : (entrySnapshot.best_bid ?? entrySnapshot.no_price);

  if (bookPrice == null || bookPrice <= 0 || bookPrice >= 1) {
    return { filled: false, fillPrice: 0, slippage: 0, trade: null, skipReason: 'no valid book price' };
  }

  // 2. Check fill feasibility (can we get within slippage tolerance?)
  const slippage = Math.abs(bookPrice - intent.suggestedPrice) / Math.max(intent.suggestedPrice, 0.001);
  if (slippage > MAX_SLIPPAGE) {
    return { filled: false, fillPrice: bookPrice, slippage, trade: null, skipReason: `slippage ${(slippage * 100).toFixed(1)}% > ${MAX_SLIPPAGE * 100}%` };
  }

  const fillPrice = bookPrice;

  // 3. Find resolution in future snapshots
  const resolvedSnap = futureSnapshots.find(s => s.resolved && s.resolution != null);
  const resolution = resolvedSnap?.resolution ?? null;

  // 4. Calculate PnL
  const { pnl, outcome } = calcTradePnl(intent.side, fillPrice, intent.suggestedSize, resolution);

  const trade: BacktestTrade = {
    marketId:       intent.marketId,
    marketQuestion: intent.marketQuestion,
    side:           intent.side,
    entryPrice:     intent.suggestedPrice,
    fillPrice,
    size:           intent.suggestedSize,
    resolution,
    outcome,
    pnl,
    ev:             intent.ev,
    snappedAt:      entrySnapshot.snapped_at,
  };

  return { filled: true, fillPrice, slippage, trade, skipReason: null };
}

// ─── Liquidity check ──────────────────────────────────────────────────────────
// Mirrors the risk engine's liquidity multiplier check.
export function hasAdequateLiquidity(
  snapshot: MarketSnapshot,
  size: number,
  multiplier: number,
): boolean {
  const liquidity = snapshot.liquidity_usd ?? 0;
  return liquidity >= size * multiplier;
}
