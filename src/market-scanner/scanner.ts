import { polymarket } from '../api/polymarket.js';
import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import { logger } from '../utils/logger.js';
import { getBlacklistedMarketIds, insertMarketSnapshot } from '../db/queries.js';
import type { NormalisedMarket, OrderBook } from '../api/polymarket.js';
import type { MarketRegime } from '../strategy/sandbox.js';

// ─── Regime detection ─────────────────────────────────────────────────────────

function detectRegime(markets: NormalisedMarket[]): MarketRegime {
  if (markets.length === 0) return 'NORMAL';

  const now = Date.now();
  const h24 = 24 * 60 * 60 * 1000;

  const resolvingSoon = markets.filter(
    (m) => m.endDate && m.endDate.getTime() - now < h24,
  ).length;

  if (resolvingSoon / markets.length > 0.3) return 'PRE_RESOLUTION';

  const political = markets.filter(
    (m) => m.category?.toLowerCase() === 'politics',
  ).length;

  if (political / markets.length > 0.5) return 'ELECTION_PERIOD';

  const avgLiquidity = markets.reduce((s, m) => s + m.liquidity, 0) / markets.length;
  if (avgLiquidity < 5_000) return 'LOW_LIQUIDITY';

  // Spread proxy: |yes + no - 1| captures implied spread in binary markets
  const avgSpread =
    markets.reduce((s, m) => s + Math.abs(1 - m.yesPrice - m.noPrice), 0) / markets.length;

  if (avgSpread > 0.08) return 'HIGH_VOLATILITY';

  return 'NORMAL';
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

class MarketScanner {
  private lastVolumes = new Map<string, number>();

  async scan(): Promise<{ markets: NormalisedMarket[]; regime: MarketRegime }> {
    logger.info('Market scan starting');

    const [markets, blacklisted] = await Promise.all([
      polymarket.getMarkets(200),
      getBlacklistedMarketIds(),
    ]);

    const active = markets.filter((m) => m.active && !blacklisted.has(m.id));
    logger.info(`Fetched ${markets.length} markets, ${active.length} eligible after filters`);

    const regime = this.detectWithVolumeSpike(active);

    await this.persistSnapshots(active, regime);
    this.emitUpdates(active, regime);
    this.updateVolumeBaseline(active);

    return { markets: active, regime };
  }

  // Enrich base regime detection with volume spike check
  private detectWithVolumeSpike(markets: NormalisedMarket[]): MarketRegime {
    const base = detectRegime(markets);
    if (base !== 'NORMAL') return base;

    // NEWS_SPIKE: any market with volume > 3× its last-seen baseline
    for (const m of markets) {
      const prev = this.lastVolumes.get(m.id);
      if (prev && prev > 0 && m.volume > prev * 3) {
        return 'NEWS_SPIKE';
      }
    }

    return 'NORMAL';
  }

  private async persistSnapshots(
    markets: NormalisedMarket[],
    regime: MarketRegime,
  ): Promise<void> {
    // Fire-and-forget: write snapshots in parallel, do not block scan cycle
    const writes = markets.map((m) =>
      insertMarketSnapshot({
        market_id: m.id,
        market_question: m.question,
        category: m.category,
        yes_price: m.yesPrice,
        no_price: m.noPrice,
        best_bid: null,
        best_ask: null,
        spread: Math.abs(1 - m.yesPrice - m.noPrice),
        volume_usd: m.volume,
        liquidity_usd: m.liquidity,
        regime,
        end_date: m.endDate?.toISOString() ?? null,
      }),
    );

    await Promise.allSettled(writes);
  }

  private emitUpdates(markets: NormalisedMarket[], regime: MarketRegime): void {
    for (const m of markets) {
      eventBus.emit(EVENTS.MARKET_UPDATED, {
        marketId: m.id,
        question: m.question,
        yesPrice: m.yesPrice,
        noPrice: m.noPrice,
        volume: m.volume,
        liquidity: m.liquidity,
        regime,
      });
    }
  }

  private updateVolumeBaseline(markets: NormalisedMarket[]): void {
    for (const m of markets) {
      this.lastVolumes.set(m.id, m.volume);
    }
  }

  // Fetch order books for a subset of markets (used by execution engine)
  async fetchOrderBooks(
    tokenIds: string[],
  ): Promise<Record<string, OrderBook>> {
    const results = await Promise.allSettled(
      tokenIds.map((id) => polymarket.getOrderBook(id)),
    );

    const books: Record<string, OrderBook> = {};
    for (let i = 0; i < tokenIds.length; i++) {
      const r = results[i];
      const id = tokenIds[i];
      if (r && r.status === 'fulfilled' && r.value && id) {
        books[id] = r.value;
      }
    }
    return books;
  }
}

export const marketScanner = new MarketScanner();
export type { MarketRegime };
