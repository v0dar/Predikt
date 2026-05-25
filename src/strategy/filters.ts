import type { MarketSnapshot } from './sandbox.js';
import type { BotSettings } from '../db/types.js';

// ─── Filter functions ─────────────────────────────────────────────────────────
// Each returns true if the market PASSES (should be included).
// All filters are pure: no async, no side effects.

export function passesLiquidityFilter(
  market: MarketSnapshot,
  settings: BotSettings,
): boolean {
  const minLiquidity = settings.MAX_BET_USD * settings.MIN_LIQUIDITY_MULTIPLIER;
  return market.liquidity >= minLiquidity;
}

export function passesVolumeFilter(market: MarketSnapshot): boolean {
  return market.volume >= 1_000;
}

export function passesExpiryFilter(market: MarketSnapshot): boolean {
  if (!market.endDate) return false;
  const now = Date.now();
  const end = market.endDate.getTime();
  const hoursUntilEnd = (end - now) / (1000 * 60 * 60);
  // Skip markets resolving within 2 hours or already expired
  return hoursUntilEnd >= 2;
}

export function passesPriceFilter(market: MarketSnapshot): boolean {
  // Skip near-certain markets (>97% or <3%) — no meaningful edge to be found
  const p = market.yesPrice;
  return p >= 0.03 && p <= 0.97;
}

export function passesMinimumOrderFilter(
  market: MarketSnapshot,
  intendedSize: number,
): boolean {
  return intendedSize >= market.minimumOrderSize;
}

// ─── Composite filter ─────────────────────────────────────────────────────────

export interface FilterResult {
  passed: boolean;
  reason?: string;
}

export function applyBaseFilters(
  market: MarketSnapshot,
  settings: BotSettings,
  blacklistedIds: Set<string>,
): FilterResult {
  if (blacklistedIds.has(market.id)) {
    return { passed: false, reason: 'blacklisted' };
  }
  if (!passesExpiryFilter(market)) {
    return { passed: false, reason: 'too-close-to-expiry' };
  }
  if (!passesLiquidityFilter(market, settings)) {
    return { passed: false, reason: 'insufficient-liquidity' };
  }
  if (!passesVolumeFilter(market)) {
    return { passed: false, reason: 'insufficient-volume' };
  }
  if (!passesPriceFilter(market)) {
    return { passed: false, reason: 'price-out-of-range' };
  }
  return { passed: true };
}
