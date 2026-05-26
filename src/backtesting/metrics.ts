// ─── Backtesting Metrics ──────────────────────────────────────────────────────
// Pure functions only. No DB, no API, no side effects.

export interface BacktestTrade {
  marketId: string;
  marketQuestion: string;
  side: 'YES' | 'NO';
  entryPrice: number;
  fillPrice: number;
  size: number;
  resolution: 'YES' | 'NO' | 'INVALID' | null;
  outcome: 'win' | 'loss' | 'unresolved';
  pnl: number;
  ev: number;
  snappedAt: string;
}

export interface EquityPoint {
  date: string;
  balance: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  unresolvedTrades: number;
  winRate: number;           // 0–1
  totalPnl: number;
  roiPercent: number;
  sharpeRatio: number;
  maxDrawdown: number;       // 0–1 (fraction of peak)
  avgEvAtEntry: number;
  equityCurve: EquityPoint[];
}

// ─── Sharpe ratio ─────────────────────────────────────────────────────────────
// Annualised daily Sharpe (assumes 365 trading days, risk-free = 0).
export function calcSharpe(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const n = dailyReturns.length;
  const mean = dailyReturns.reduce((s, r) => s + r, 0) / n;
  const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (mean / stdDev) * Math.sqrt(365);
}

// ─── Max drawdown ─────────────────────────────────────────────────────────────
// Returns fraction (0–1) of the worst peak-to-trough decline.
export function calcMaxDrawdown(balances: number[]): number {
  if (balances.length < 2) return 0;
  let peak = balances[0] ?? 0;
  let maxDD = 0;
  for (const b of balances) {
    if (b > peak) peak = b;
    if (peak > 0) {
      const dd = (peak - b) / peak;
      if (dd > maxDD) maxDD = dd;
    }
  }
  return maxDD;
}

// ─── Daily returns from equity curve ─────────────────────────────────────────
export function dailyReturns(curve: EquityPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1]!.balance;
    const curr = curve[i]!.balance;
    returns.push(prev > 0 ? (curr - prev) / prev : 0);
  }
  return returns;
}

// ─── PnL calculation ──────────────────────────────────────────────────────────
// In a binary prediction market:
//   Buy YES at fillPrice p → receive (size/p) shares. Each share pays $1 on win.
//   Payout on win  = size / p
//   PnL on win     = (size / p) - size = size * (1 - p) / p
//   PnL on loss    = -size
//   PnL on INVALID = 0 (position refunded at cost)
export function calcTradePnl(
  side: 'YES' | 'NO',
  fillPrice: number,
  size: number,
  resolution: 'YES' | 'NO' | 'INVALID' | null,
): { pnl: number; outcome: 'win' | 'loss' | 'unresolved' } {
  if (resolution === null) return { pnl: 0, outcome: 'unresolved' };
  if (resolution === 'INVALID') return { pnl: 0, outcome: 'unresolved' };
  const won = resolution === side;
  if (won) {
    const pnl = size * (1 - fillPrice) / fillPrice;
    return { pnl, outcome: 'win' };
  }
  return { pnl: -size, outcome: 'loss' };
}

// ─── Full metrics computation ─────────────────────────────────────────────────
export function computeMetrics(
  trades: BacktestTrade[],
  startingBalance: number,
  equityCurve: EquityPoint[],
): BacktestMetrics {
  const resolved = trades.filter(t => t.outcome !== 'unresolved');
  const won      = resolved.filter(t => t.outcome === 'win');
  const lost     = resolved.filter(t => t.outcome === 'loss');

  const totalPnl    = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate     = resolved.length > 0 ? won.length / resolved.length : 0;
  const roiPercent  = startingBalance > 0 ? (totalPnl / startingBalance) * 100 : 0;
  const avgEv       = trades.length > 0 ? trades.reduce((s, t) => s + t.ev, 0) / trades.length : 0;

  const balances = equityCurve.map(p => p.balance);
  const dr       = dailyReturns(equityCurve);

  return {
    totalTrades:      trades.length,
    winningTrades:    won.length,
    losingTrades:     lost.length,
    unresolvedTrades: trades.filter(t => t.outcome === 'unresolved').length,
    winRate,
    totalPnl,
    roiPercent,
    sharpeRatio:  calcSharpe(dr),
    maxDrawdown:  calcMaxDrawdown(balances),
    avgEvAtEntry: avgEv,
    equityCurve,
  };
}
