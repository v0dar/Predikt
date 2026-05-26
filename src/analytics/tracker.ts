import { logger } from '../utils/logger.js';
import type {
  OrderFilledPayload,
  PositionClosedPayload,
  TradeRejectedPayload,
} from '../events/event-types.js';

// ─── Per-strategy stats ───────────────────────────────────────────────────────

interface StrategyStats {
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  totalEv: number;           // sum of EV at entry (for calibration)
  totalSlippage: number;
  slippageSamples: number;
}

function emptyStats(): StrategyStats {
  return { trades: 0, wins: 0, losses: 0, totalPnl: 0, totalEv: 0, totalSlippage: 0, slippageSamples: 0 };
}

// ─── Analytics Tracker ────────────────────────────────────────────────────────
// In-memory rolling stats. Summarised periodically to logs.
// Extended to write to Supabase when backtesting module is built (Phase 12).

class AnalyticsTracker {
  private readonly strategyStats = new Map<string, StrategyStats>();
  private totalFills = 0;
  private totalRejections = 0;
  private readonly rejectionReasons = new Map<string, number>();
  private readonly holdTimes: number[] = [];

  // ── Event receivers (conform to AnalyticsClient interface) ───────────────────

  recordFill(payload: unknown): void {
    const p = payload as OrderFilledPayload;
    this.totalFills++;

    logger.debug('Analytics: fill', {
      marketId: p.marketId,
      side: p.side,
      size: p.size,
      fillPrice: p.fillPrice,
    });
  }

  recordClose(payload: unknown): void {
    const p = payload as PositionClosedPayload;
    const key = 'unknown'; // strategy name not in PositionClosedPayload — Phase 12 can extend

    if (!this.strategyStats.has(key)) this.strategyStats.set(key, emptyStats());
    const stats = this.strategyStats.get(key)!;

    stats.trades++;
    stats.totalPnl += p.pnl;
    if (p.outcome === 'win') stats.wins++;
    else stats.losses++;

    if (p.holdTimeMs > 0) this.holdTimes.push(p.holdTimeMs);

    logger.debug('Analytics: close', {
      outcome: p.outcome,
      pnl: `$${p.pnl.toFixed(2)}`,
      holdTimeHours: (p.holdTimeMs / 3_600_000).toFixed(1),
    });
  }

  recordRejection(payload: unknown): void {
    const p = payload as TradeRejectedPayload;
    this.totalRejections++;

    const count = this.rejectionReasons.get(p.reason) ?? 0;
    this.rejectionReasons.set(p.reason, count + 1);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  getSummary(): Record<string, unknown> {
    const allStats = [...this.strategyStats.values()];
    const totalTrades = allStats.reduce((s, st) => s + st.trades, 0);
    const totalWins = allStats.reduce((s, st) => s + st.wins, 0);
    const totalPnl = allStats.reduce((s, st) => s + st.totalPnl, 0);
    const avgHoldHours =
      this.holdTimes.length > 0
        ? this.holdTimes.reduce((a, b) => a + b, 0) / this.holdTimes.length / 3_600_000
        : 0;

    return {
      totalTrades,
      totalFills: this.totalFills,
      totalRejections: this.totalRejections,
      winRate: totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) + '%' : 'n/a',
      totalPnl: `$${totalPnl.toFixed(2)}`,
      avgHoldTimeHours: avgHoldHours.toFixed(1),
      topRejectionReason: this.topRejectionReason(),
    };
  }

  logSummary(): void {
    const summary = this.getSummary();
    if ((summary['totalTrades'] as number) === 0) return;
    logger.info('Analytics summary', summary);
  }

  private topRejectionReason(): string | null {
    let top: [string, number] | null = null;
    for (const entry of this.rejectionReasons) {
      if (!top || entry[1] > top[1]) top = entry;
    }
    return top?.[0] ?? null;
  }
}

export const analyticsTracker = new AnalyticsTracker();
