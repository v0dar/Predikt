// Pure functions only — no side effects, no imports, fully unit-testable.

// ─── Kelly Criterion ──────────────────────────────────────────────────────────

/**
 * Raw Kelly fraction: optimal bankroll % to bet given edge.
 * Returns 0 if there is no edge or inputs are invalid.
 */
export function kellyFraction(trueProb: number, marketPrice: number): number {
  if (marketPrice <= 0 || marketPrice >= 1) return 0;
  if (trueProb <= 0 || trueProb >= 1) return 0;
  const odds = 1 / marketPrice - 1; // net odds (b)
  const q = 1 - trueProb;
  const raw = (odds * trueProb - q) / odds;
  return Math.max(0, raw);
}

/**
 * Fractional Kelly sizing in USD, capped at maxBetUsd.
 * fractionCap: 0.25 = quarter-Kelly (recommended default).
 */
export function kellySizeUsd(
  bankroll: number,
  trueProb: number,
  marketPrice: number,
  fractionCap: number,
  maxBetUsd: number,
): number {
  const raw = kellyFraction(trueProb, marketPrice) * fractionCap;
  return clamp(bankroll * raw, 0, maxBetUsd);
}

// ─── Expected Value ───────────────────────────────────────────────────────────

/**
 * EV as a percentage edge.
 * Positive = we have an edge. Negative = market is better-priced than our model.
 * Example: trueProb=0.70, marketPrice=0.65 → EV ≈ 7.7%
 */
export function expectedValue(trueProb: number, marketPrice: number): number {
  if (marketPrice <= 0) return 0;
  return (trueProb / marketPrice - 1) * 100;
}

// ─── Sharpe Ratio ─────────────────────────────────────────────────────────────

/**
 * Annualised Sharpe ratio from daily returns (as fractions, e.g. 0.02 = 2%).
 * Uses sample std deviation (N-1). Returns 0 if too few data points.
 */
export function sharpeRatio(returns: number[], riskFreeRate: number = 0): number {
  if (returns.length < 2) return 0;
  const n = returns.length;
  const avg = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((sum, r) => sum + (r - avg) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return ((avg - riskFreeRate) / stdDev) * Math.sqrt(365);
}

// ─── Drawdown ─────────────────────────────────────────────────────────────────

/**
 * Maximum peak-to-trough drawdown over a balance history (fraction 0–1).
 */
export function maxDrawdown(balances: number[]): number {
  let peak = -Infinity;
  let maxDD = 0;
  for (const b of balances) {
    if (b > peak) peak = b;
    const dd = peak > 0 ? (peak - b) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

/**
 * Drawdown from the most recent peak to the last balance (fraction 0–1).
 */
export function currentDrawdown(balances: number[]): number {
  if (balances.length === 0) return 0;
  let peak = -Infinity;
  for (const b of balances) if (b > peak) peak = b;
  const current = balances[balances.length - 1] ?? 0;
  return peak > 0 ? Math.max(0, (peak - current) / peak) : 0;
}

// ─── Order Book ───────────────────────────────────────────────────────────────

/**
 * Total USDC liquidity available within slippageTolerance of targetPrice.
 * orders: ask-side for buys, bid-side for sells (price, size in shares).
 */
export function availableLiquidityAtPrice(
  orders: { price: number; size: number }[],
  targetPrice: number,
  slippageTolerance: number,
): number {
  return orders
    .filter((o) => Math.abs(o.price - targetPrice) / Math.max(targetPrice, 0.001) <= slippageTolerance)
    .reduce((sum, o) => sum + o.size * o.price, 0);
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export function winRate(outcomes: ('win' | 'loss')[]): number {
  if (outcomes.length === 0) return 0;
  return (outcomes.filter((o) => o === 'win').length / outcomes.length) * 100;
}

export function roundToTick(price: number, tickSize: number = 0.001): number {
  return Math.round(price / tickSize) * tickSize;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function toMicroUsdc(usdAmount: number): bigint {
  return BigInt(Math.round(usdAmount * 1_000_000));
}

export function fromMicroUsdc(micro: bigint): number {
  return Number(micro) / 1_000_000;
}
