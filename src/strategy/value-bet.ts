import { BaseStrategy } from './base.js';
import type { StrategyContext, TradeIntent, MarketSnapshot } from './sandbox.js';
import { applyBaseFilters } from './filters.js';
import { expectedValue, kellySizeUsd, roundToTick } from '../utils/math.js';
import type { OrderBook } from '../api/polymarket.js';

// ─── Value-Bet Strategy ───────────────────────────────────────────────────────
// Uses the order book mid-price as market price and estimates true probability
// via a simple mean-reversion model: markets far from 0.5 are slightly faded.
// Any market where EV > MIN_EDGE_PERCENT passes for a position.
//
// This is the default production strategy. Replace trueProb estimation with a
// better model (Kalshi cross-reference, news sentiment, etc.) for real edge.

export class ValueBetStrategy extends BaseStrategy {
  override readonly name = 'value-bet';

  override evaluate(context: StrategyContext): TradeIntent[] {
    const { markets, orderBooks, currentBalance, openPositions, settings, regime } = context;

    // Hard block in extreme regimes where edge estimation degrades
    if (regime === 'HIGH_VOLATILITY' || regime === 'NEWS_SPIKE') {
      return [];
    }

    const blacklistedIds = new Set(
      openPositions.map((p) => p.market_id).filter((id): id is string => id !== null),
    );

    const intents: TradeIntent[] = [];

    for (const market of markets) {
      const filterResult = applyBaseFilters(market, settings, blacklistedIds);
      if (!filterResult.passed) continue;

      // Skip markets we already have an open position in
      const alreadyOpen = openPositions.some((p) => p.market_id === market.id);
      if (alreadyOpen) continue;

      const intent = this.evaluateMarket(market, orderBooks, currentBalance, settings);
      if (intent) intents.push(intent);
    }

    return intents;
  }

  private evaluateMarket(
    market: MarketSnapshot,
    orderBooks: Readonly<Record<string, OrderBook>>,
    currentBalance: number,
    settings: StrategyContext['settings'],
  ): TradeIntent | null {
    // Determine which side has the edge
    const yesEv = this.computeEdge(market.yesPrice);
    const noEv = this.computeEdge(market.noPrice);

    let side: 'YES' | 'NO';
    let marketPrice: number;
    let trueProb: number;
    let ev: number;
    let tokenId: string;

    if (yesEv >= noEv && yesEv > 0) {
      side = 'YES';
      marketPrice = market.yesPrice;
      trueProb = this.estimateTrueProb(market.yesPrice, 'YES');
      ev = yesEv;
      tokenId = market.yesTokenId;
    } else if (noEv > 0) {
      side = 'NO';
      marketPrice = market.noPrice;
      trueProb = this.estimateTrueProb(market.noPrice, 'NO');
      ev = noEv;
      tokenId = market.noTokenId;
    } else {
      return null;
    }

    if (ev < settings.MIN_EDGE_PERCENT) return null;

    const kellySize = kellySizeUsd(
      currentBalance,
      trueProb,
      marketPrice,
      settings.KELLY_FRACTION,
      settings.MAX_BET_USD,
    );

    if (kellySize < market.minimumOrderSize) return null;

    const suggestedPrice = roundToTick(marketPrice, market.tickSize);

    return {
      marketId: market.id,
      marketQuestion: market.question,
      tokenId,
      side,
      suggestedPrice,
      suggestedSize: Math.min(kellySize, settings.MAX_BET_USD),
      trueProb,
      ev,
      kellySize,
      strategyName: this.name,
      reasoning: `EV=${ev.toFixed(1)}% at price=${marketPrice.toFixed(3)}, trueProb=${trueProb.toFixed(3)}`,
    };
  }

  // Simple mean-reversion probability estimator.
  // Markets that price an outcome at 60¢ are treated as if the true prob is ~62–63¢
  // (markets slightly underestimate tails). This is deliberately conservative.
  private estimateTrueProb(marketPrice: number, _side: 'YES' | 'NO'): number {
    // Slight upward adjustment from market price, capped within valid range
    const adjustment = 0.03 * (1 - Math.abs(2 * marketPrice - 1));
    return Math.min(0.97, Math.max(0.03, marketPrice + adjustment));
  }

  private computeEdge(marketPrice: number): number {
    const trueProb = this.estimateTrueProb(marketPrice, 'YES');
    return expectedValue(trueProb, marketPrice);
  }
}

export const valueBetStrategy = new ValueBetStrategy();
