// ─── Backtesting Runner ───────────────────────────────────────────────────────
// Replays historical market_snapshots through any strategy and simulates fills.
// Saves results to backtest_runs. Pure replay — no live API calls.

import { logger } from '../utils/logger.js';
import { supabase } from '../db/supabase.js';
import { valueBetStrategy } from '../strategy/value-bet.js';
import { buildStrategyContext, type MarketRegime } from '../strategy/sandbox.js';
import type { NormalisedMarket, OrderBook, OrderBookEntry } from '../api/polymarket.js';
import type { MarketSnapshot as DbMarketSnapshot } from '../db/types.js';
import type { BotSettings } from '../db/types.js';
import type { BacktestMetrics, BacktestTrade } from './metrics.js';
import { computeMetrics } from './metrics.js';
import { simulateFill, hasAdequateLiquidity } from './simulator.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BacktestConfig {
  strategyName:    string;
  dateFrom:        string;  // ISO date string
  dateTo:          string;
  startingBalance: number;
  minEdgePercent:  number;
  maxBetUsd:       number;
  kellyFraction:   number;
}

export interface BacktestResult extends BacktestMetrics {
  runId:    number | null;
  trades:   BacktestTrade[];
  config:   BacktestConfig;
}

// ─── Synthetic market + order book from DB snapshot ──────────────────────────

function snapshotToMarket(snap: DbMarketSnapshot): NormalisedMarket {
  const yesPrice = snap.yes_price ?? 0.5;
  return {
    id:               snap.market_id ?? 'unknown',
    question:         snap.market_question ?? '',
    category:         snap.category ?? 'General',
    endDate:          snap.end_date ? new Date(snap.end_date) : null,
    yesTokenId:       `${snap.market_id}-YES`,
    noTokenId:        `${snap.market_id}-NO`,
    yesPrice,
    noPrice:          snap.no_price ?? (1 - yesPrice),
    volume:           snap.volume_usd ?? 0,
    liquidity:        snap.liquidity_usd ?? 0,
    minimumOrderSize: 1,
    tickSize:         0.01,
    active:           !snap.resolved,
  };
}

function snapshotToOrderBook(snap: DbMarketSnapshot, tokenId: string, side: 'YES' | 'NO'): OrderBook {
  const price   = side === 'YES' ? (snap.yes_price ?? 0.5) : (snap.no_price ?? 0.5);
  const bestBid = snap.best_bid ?? price * 0.98;
  const bestAsk = snap.best_ask ?? price * 1.02;
  const liquidity = (snap.liquidity_usd ?? 100) / 2;

  const bids: OrderBookEntry[] = [
    { price: bestBid, size: liquidity * 0.6 },
    { price: bestBid * 0.98, size: liquidity * 0.4 },
  ];
  const asks: OrderBookEntry[] = [
    { price: bestAsk, size: liquidity * 0.6 },
    { price: bestAsk * 1.02, size: liquidity * 0.4 },
  ];

  return { market: snap.market_id ?? '', asset_id: tokenId, bids, asks, hash: '' };
}

// ─── Group snapshots by scan period (one per calendar day) ───────────────────

function groupByDay(snaps: DbMarketSnapshot[]): Map<string, DbMarketSnapshot[]> {
  const groups = new Map<string, DbMarketSnapshot[]>();
  for (const s of snaps) {
    const day = s.snapped_at.slice(0, 10);
    let arr = groups.get(day);
    if (!arr) { arr = []; groups.set(day, arr); }
    arr.push(s);
  }
  return groups;
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  logger.info('Backtest starting', config);

  const { dateFrom, dateTo, startingBalance, minEdgePercent, maxBetUsd, kellyFraction } = config;

  // 1. Load all snapshots in the date range (+ 30 days past dateTo for resolution data)
  const extendedTo = new Date(dateTo);
  extendedTo.setDate(extendedTo.getDate() + 30);

  const { data: allSnaps, error } = await supabase
    .from('market_snapshots')
    .select('*')
    .gte('snapped_at', dateFrom)
    .lte('snapped_at', extendedTo.toISOString().slice(0, 10) + 'T23:59:59Z')
    .order('snapped_at', { ascending: true });

  if (error) throw new Error(`Backtest DB load failed: ${error.message}`);
  if (!allSnaps || allSnaps.length === 0) {
    throw new Error('No market snapshots found for the selected date range. Run the bot for at least one scan cycle first.');
  }

  // Separate entry window from future resolution data
  const entrySnaps  = allSnaps.filter(s => s.snapped_at.slice(0, 10) <= dateTo);
  const resolvePool = allSnaps.filter(s => s.resolved && s.resolution != null);

  logger.info('Backtest data loaded', { entrySnaps: entrySnaps.length, resolvedSnaps: resolvePool.length });

  // Build resolution index: marketId → resolved snapshot
  const resolutionIndex = new Map<string, DbMarketSnapshot>();
  for (const s of resolvePool) {
    if (s.market_id && !resolutionIndex.has(s.market_id)) {
      resolutionIndex.set(s.market_id, s);
    }
  }

  // 2. Build synthetic BotSettings for this backtest
  const syntheticSettings: BotSettings = {
    MODE:                        'demo',
    DEMO_STARTING_BALANCE:       startingBalance,
    DEMO_CURRENT_BALANCE:        startingBalance,
    MAX_BET_USD:                 maxBetUsd,
    MAX_BET_PERCENT:             5,
    AUTO_SCALE_BETS:             false,
    MIN_EDGE_PERCENT:            minEdgePercent,
    KELLY_FRACTION:              kellyFraction,
    MAX_OPEN_POSITIONS:          10,
    CRON_SCHEDULE:               '*/5 * * * *',
    DRY_RUN:                     true,
    DAILY_LOSS_LIMIT_USD:        startingBalance * 0.1,
    MAX_SLIPPAGE_PERCENT:        3,
    MIN_LIQUIDITY_MULTIPLIER:    3,
    AUTO_PAUSE_WIN_RATE_THRESHOLD: 40,
    AUTO_PAUSE_LOOKBACK_TRADES:  20,
    MIN_MATIC_BALANCE:           0.5,
    TELEGRAM_NOTIFICATIONS:      false,
    STRATEGY:                    config.strategyName,
  };

  // 3. Simulate day-by-day
  let balance = startingBalance;
  const trades: BacktestTrade[] = [];
  const equityCurve: { date: string; balance: number }[] = [
    { date: dateFrom, balance: startingBalance },
  ];

  const dayGroups = groupByDay(entrySnaps);
  const sortedDays = [...dayGroups.keys()].sort();

  for (const day of sortedDays) {
    const daySnaps = dayGroups.get(day)!;

    // Only use unresolved markets for signal generation
    const activeSnaps = daySnaps.filter(s => !s.resolved && (s.market_id != null));

    if (activeSnaps.length === 0) continue;

    // Build context for this day
    const markets   = activeSnaps.map(snapshotToMarket);
    const orderBooks: Record<string, OrderBook> = {};
    for (const snap of activeSnaps) {
      const m = snapshotToMarket(snap);
      orderBooks[m.yesTokenId] = snapshotToOrderBook(snap, m.yesTokenId, 'YES');
      orderBooks[m.noTokenId]  = snapshotToOrderBook(snap, m.noTokenId, 'NO');
    }

    // Detect regime from this day's snapshots
    const regime = detectRegime(activeSnaps);

    const context = buildStrategyContext(
      markets,
      orderBooks,
      balance,
      [],   // no open positions in backtest (simplification)
      syntheticSettings,
      regime,
    );

    // Run strategy
    const intents = valueBetStrategy.evaluate(context);

    // Simulate each intent
    for (const intent of intents) {
      if (balance < intent.suggestedSize) continue; // insufficient balance

      // Find entry snapshot for this market
      const entrySnap = activeSnaps.find(s => s.market_id === intent.marketId);
      if (!entrySnap) continue;

      // Liquidity check
      if (!hasAdequateLiquidity(entrySnap, intent.suggestedSize, syntheticSettings.MIN_LIQUIDITY_MULTIPLIER)) continue;

      // Future resolution data
      const resolvedSnap = resolutionIndex.get(intent.marketId);
      const futureSnaps: DbMarketSnapshot[] = resolvedSnap ? [resolvedSnap] : [];

      const result = simulateFill(intent, entrySnap, futureSnaps);
      if (!result.filled || !result.trade) continue;

      // Deduct cost
      balance -= intent.suggestedSize;

      // Add payout if resolved
      if (result.trade.outcome === 'win') {
        balance += intent.suggestedSize / result.fillPrice;
      } else if (result.trade.outcome === 'unresolved') {
        // Refund if unresolved — conservative assumption
        balance += intent.suggestedSize;
      }
      // Loss: money already deducted above

      trades.push(result.trade);
    }

    equityCurve.push({ date: day, balance });
  }

  // 4. Compute metrics
  const metrics = computeMetrics(trades, startingBalance, equityCurve);

  // 5. Save to DB
  const settingsSnapshot: Record<string, string> = {
    minEdgePercent: String(minEdgePercent),
    maxBetUsd:      String(maxBetUsd),
    kellyFraction:  String(kellyFraction),
  };

  const { data: saved } = await supabase
    .from('backtest_runs')
    .insert({
      strategy_name:    config.strategyName,
      date_from:        dateFrom,
      date_to:          dateTo,
      starting_balance: startingBalance,
      ending_balance:   balance,
      total_trades:     metrics.totalTrades,
      winning_trades:   metrics.winningTrades,
      win_rate:         metrics.winRate * 100,
      total_pnl:        metrics.totalPnl,
      roi_percent:      metrics.roiPercent,
      sharpe_ratio:     metrics.sharpeRatio,
      max_drawdown:     metrics.maxDrawdown * 100,
      avg_ev_at_entry:  metrics.avgEvAtEntry,
      settings_snapshot: settingsSnapshot,
    })
    .select('id')
    .single();

  logger.info('Backtest complete', {
    trades:     metrics.totalTrades,
    winRate:    `${(metrics.winRate * 100).toFixed(1)}%`,
    roi:        `${metrics.roiPercent.toFixed(2)}%`,
    sharpe:     metrics.sharpeRatio.toFixed(2),
    maxDrawdown:`${(metrics.maxDrawdown * 100).toFixed(1)}%`,
  });

  return {
    ...metrics,
    runId:  saved?.id ?? null,
    trades,
    config,
  };
}

// ─── Lightweight regime detection for historical data ─────────────────────────

function detectRegime(snaps: DbMarketSnapshot[]): MarketRegime {
  if (snaps.length === 0) return 'NORMAL';

  // Use the regime field stored in snapshots if available
  const regimes = snaps.map(s => s.regime).filter(Boolean);
  if (regimes.length > 0) {
    const counts = new Map<string, number>();
    for (const r of regimes) {
      counts.set(r!, (counts.get(r!) ?? 0) + 1);
    }
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (dominant) return dominant as MarketRegime;
  }

  // Fallback: derive from snapshot data
  const avgSpread = snaps.reduce((s, m) => s + (m.spread ?? 0.04), 0) / snaps.length;
  const avgLiq    = snaps.reduce((s, m) => s + (m.liquidity_usd ?? 0), 0) / snaps.length;
  const resolving = snaps.filter(s => {
    if (!s.end_date) return false;
    const hoursLeft = (new Date(s.end_date).getTime() - Date.now()) / 3_600_000;
    return hoursLeft < 24;
  }).length / snaps.length;

  if (resolving > 0.3) return 'PRE_RESOLUTION';
  if (avgSpread > 0.08) return 'HIGH_VOLATILITY';
  if (avgLiq < 5_000)  return 'LOW_LIQUIDITY';
  return 'NORMAL';
}
