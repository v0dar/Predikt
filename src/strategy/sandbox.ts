import type { NormalisedMarket, OrderBook } from '../api/polymarket.js';
import type { BotSettings, Position } from '../db/types.js';

// ─── Market regime ─────────────────────────────────────────────────────────────

export type MarketRegime =
  | 'NORMAL'
  | 'HIGH_VOLATILITY'
  | 'LOW_LIQUIDITY'
  | 'NEWS_SPIKE'
  | 'PRE_RESOLUTION'
  | 'ELECTION_PERIOD';

// ─── Strategy context (read-only snapshot) ────────────────────────────────────
// Passed to every strategy. Strategies MUST NOT mutate this or call external APIs.

export interface MarketSnapshot {
  id: string;
  question: string;
  category: string;
  endDate: Date | null;
  yesTokenId: string;
  noTokenId: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  minimumOrderSize: number;
  tickSize: number;
}

export interface StrategyContext {
  readonly markets: MarketSnapshot[];
  readonly orderBooks: Readonly<Record<string, OrderBook>>;
  readonly currentBalance: number;
  readonly openPositions: ReadonlyArray<Position>;
  readonly settings: Readonly<BotSettings>;
  readonly regime: MarketRegime;
  readonly mode: 'demo' | 'live';
}

// ─── Trade intent ─────────────────────────────────────────────────────────────
// The ONLY output a strategy may produce. No side effects. No DB calls.

export interface TradeIntent {
  marketId: string;
  marketQuestion: string;
  tokenId: string;
  side: 'YES' | 'NO';
  suggestedPrice: number;
  suggestedSize: number;
  trueProb: number;
  ev: number;
  kellySize: number;
  strategyName: string;
  reasoning: string;
}

// ─── Helper: build StrategyContext from live data ─────────────────────────────

export function buildStrategyContext(
  markets: NormalisedMarket[],
  orderBooks: Record<string, OrderBook>,
  currentBalance: number,
  openPositions: Position[],
  settings: BotSettings,
  regime: MarketRegime,
): StrategyContext {
  const snapshots: MarketSnapshot[] = markets.map((m) => ({
    id: m.id,
    question: m.question,
    category: m.category,
    endDate: m.endDate,
    yesTokenId: m.yesTokenId,
    noTokenId: m.noTokenId,
    yesPrice: m.yesPrice,
    noPrice: m.noPrice,
    volume: m.volume,
    liquidity: m.liquidity,
    minimumOrderSize: m.minimumOrderSize,
    tickSize: m.tickSize,
  }));

  return {
    markets: snapshots,
    orderBooks,
    currentBalance,
    openPositions,
    settings,
    regime,
    mode: settings.MODE,
  };
}
