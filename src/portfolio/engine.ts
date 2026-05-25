import { polymarket } from '../api/polymarket.js';
import { logger } from '../utils/logger.js';
import { maxDrawdown, currentDrawdown } from '../utils/math.js';
import {
  getOpenTrades,
  getBotStatus,
  getPnlSnapshotHistory,
  getTodayPnl,
  getSetting,
} from '../db/queries.js';
import type { Trade } from '../db/types.js';

// ─── Portfolio state ──────────────────────────────────────────────────────────

export interface PortfolioState {
  totalBalance: number;
  availableBalance: number;
  totalExposure: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openPositionCount: number;
  maxDrawdown: number;
  currentDrawdown: number;
  marketConcentration: Record<string, number>;
}

// ─── Portfolio Engine ─────────────────────────────────────────────────────────

class PortfolioEngine {
  private cached: PortfolioState | null = null;
  private cachedAt = 0;
  private readonly cacheTtlMs = 30_000;

  async getState(mode: 'demo' | 'live'): Promise<PortfolioState> {
    if (this.cached && Date.now() - this.cachedAt < this.cacheTtlMs) {
      return this.cached;
    }
    const state = await this.compute(mode);
    this.cached = state;
    this.cachedAt = Date.now();
    return state;
  }

  invalidateCache(): void {
    this.cached = null;
  }

  private async compute(mode: 'demo' | 'live'): Promise<PortfolioState> {
    const [openTrades, botStatus, snapshots, realizedPnl] = await Promise.all([
      getOpenTrades(),
      getBotStatus(),
      getPnlSnapshotHistory(90),
      getTodayPnl(),
    ]);

    // Balance
    let totalBalance: number;
    if (mode === 'demo') {
      const raw = await getSetting('DEMO_CURRENT_BALANCE');
      totalBalance = parseFloat(raw ?? '500');
    } else {
      totalBalance = botStatus?.usdc_balance ?? 0;
    }

    // Exposure: sum of open trade sizes
    const liveTrades = openTrades.filter((t) => t.mode === mode);
    const totalExposure = liveTrades.reduce((s, t) => s + t.size, 0);

    // Unrealized PnL: estimate using current market prices
    const unrealizedPnl = await this.estimateUnrealizedPnl(liveTrades);

    // Drawdown: from daily balance history
    const balanceHistory = snapshots
      .map((s) => s.ending_balance ?? 0)
      .filter((b) => b > 0);

    const maxDD = balanceHistory.length >= 2 ? maxDrawdown(balanceHistory) : 0;
    const currDD = balanceHistory.length >= 2 ? currentDrawdown(balanceHistory) : 0;

    // Market concentration: each market's exposure as fraction of total
    const concentration: Record<string, number> = {};
    if (totalExposure > 0) {
      for (const trade of liveTrades) {
        const key = trade.market_id ?? 'unknown';
        concentration[key] = ((concentration[key] ?? 0) + trade.size) / totalExposure;
      }
    }

    return {
      totalBalance,
      availableBalance: Math.max(0, totalBalance - totalExposure),
      totalExposure,
      unrealizedPnl,
      realizedPnl,
      openPositionCount: liveTrades.length,
      maxDrawdown: maxDD,
      currentDrawdown: currDD,
      marketConcentration: concentration,
    };
  }

  private async estimateUnrealizedPnl(trades: Trade[]): Promise<number> {
    if (trades.length === 0) return 0;

    let total = 0;

    const results = await Promise.allSettled(
      trades.map(async (trade) => {
        if (!trade.market_id) return 0;
        const market = await polymarket.getMarket(trade.market_id);
        if (!market) return 0;

        const currentPrice = trade.side === 'YES' ? market.yesPrice : market.noPrice;
        const entryPrice = trade.avg_fill_price ?? trade.price;
        if (entryPrice <= 0) return 0;

        // Shares held = USDC_spent / entry_price
        const shares = trade.size / entryPrice;
        // Mark-to-market value = shares × current_price
        const mtmValue = shares * currentPrice;
        return mtmValue - trade.size;
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') total += r.value;
    }

    return parseFloat(total.toFixed(6));
  }

  // Guard used by risk engine: block new trades if exposure > 80% of balance
  async isOverExposed(mode: 'demo' | 'live'): Promise<boolean> {
    try {
      const state = await this.getState(mode);
      if (state.totalBalance <= 0) return false;
      return state.totalExposure / state.totalBalance > 0.8;
    } catch {
      return false;
    }
  }

  logState(state: PortfolioState): void {
    logger.info('Portfolio state', {
      balance: `$${state.totalBalance.toFixed(2)}`,
      exposure: `$${state.totalExposure.toFixed(2)}`,
      available: `$${state.availableBalance.toFixed(2)}`,
      positions: state.openPositionCount,
      unrealizedPnl: `$${state.unrealizedPnl.toFixed(2)}`,
      realizedPnlToday: `$${state.realizedPnl.toFixed(2)}`,
      maxDrawdown: `${(state.maxDrawdown * 100).toFixed(1)}%`,
    });
  }
}

export const portfolioEngine = new PortfolioEngine();
