import { circuitBreaker } from './circuit-breaker.js';
import { stateMachine } from '../core/state-machine.js';
import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import { logger } from '../utils/logger.js';
import { availableLiquidityAtPrice } from '../utils/math.js';
import {
  getTodayPnl,
  getOpenPositionCount,
  getRollingWinRate,
  isBlacklisted,
} from '../db/queries.js';
import type { TradeIntent } from '../strategy/sandbox.js';
import type { BotSettings } from '../db/types.js';
import type { OrderBook } from '../api/polymarket.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RiskDecision {
  approved: boolean;
  reason?: string;
}

// ─── Risk Engine ──────────────────────────────────────────────────────────────
// Single gate for every TradeIntent. Checks run in order — first failure rejects.

class RiskEngine {
  async validate(
    intent: TradeIntent,
    settings: BotSettings,
    orderBook: OrderBook | null,
  ): Promise<RiskDecision> {
    // 1. Circuit breakers
    if (circuitBreaker.isOpen('polymarket_api')) {
      return this.reject(intent, 'circuit-breaker-open: polymarket_api');
    }

    // 2. State machine guard
    if (!stateMachine.canTrade()) {
      return this.reject(intent, `state-not-tradeable: ${stateMachine.state}`);
    }

    // 3. Daily loss limit
    const todayPnl = await getTodayPnl();
    if (todayPnl <= -settings.DAILY_LOSS_LIMIT_USD) {
      eventBus.emit(EVENTS.DAILY_LOSS_HIT, {
        currentLoss: Math.abs(todayPnl),
        limit: settings.DAILY_LOSS_LIMIT_USD,
      });
      return this.reject(intent, `daily-loss-limit-hit: $${(-todayPnl).toFixed(2)}`);
    }

    // 4. Max open positions
    const openCount = await getOpenPositionCount();
    if (openCount >= settings.MAX_OPEN_POSITIONS) {
      return this.reject(intent, `max-open-positions: ${openCount}/${settings.MAX_OPEN_POSITIONS}`);
    }

    // 5. Minimum edge
    if (intent.ev < settings.MIN_EDGE_PERCENT) {
      return this.reject(
        intent,
        `insufficient-edge: ${intent.ev.toFixed(1)}% < ${settings.MIN_EDGE_PERCENT}%`,
      );
    }

    // 6. Order book liquidity depth (skip if no book available)
    if (orderBook) {
      const relevantSide = intent.side === 'YES' ? orderBook.asks : orderBook.bids;
      const available = availableLiquidityAtPrice(
        relevantSide,
        intent.suggestedPrice,
        settings.MAX_SLIPPAGE_PERCENT / 100,
      );
      const required = intent.suggestedSize * settings.MIN_LIQUIDITY_MULTIPLIER;
      if (available < required) {
        return this.reject(
          intent,
          `insufficient-book-depth: $${available.toFixed(2)} < $${required.toFixed(2)}`,
        );
      }
    }

    // 7. Blacklist
    const blacklisted = await isBlacklisted(intent.marketId);
    if (blacklisted) {
      return this.reject(intent, 'blacklisted-market');
    }

    // 8. Win rate auto-pause
    const winRate = await getRollingWinRate(settings.AUTO_PAUSE_LOOKBACK_TRADES);
    if (winRate !== null && winRate < settings.AUTO_PAUSE_WIN_RATE_THRESHOLD) {
      eventBus.emit(EVENTS.BOT_PAUSED, {
        reason: `win-rate-below-threshold: ${winRate.toFixed(1)}%`,
        winRate,
      });
      return this.reject(
        intent,
        `win-rate-auto-pause: ${winRate.toFixed(1)}% < ${settings.AUTO_PAUSE_WIN_RATE_THRESHOLD}%`,
      );
    }

    // All checks passed
    eventBus.emit(EVENTS.TRADE_APPROVED, {
      marketId: intent.marketId,
      side: intent.side,
      size: intent.suggestedSize,
      price: intent.suggestedPrice,
    });

    logger.info('Trade approved by risk engine', {
      market: intent.marketId,
      side: intent.side,
      ev: `${intent.ev.toFixed(1)}%`,
      size: `$${intent.suggestedSize.toFixed(2)}`,
    });

    return { approved: true };
  }

  private reject(intent: TradeIntent, reason: string): RiskDecision {
    eventBus.emit(EVENTS.TRADE_REJECTED, {
      marketId: intent.marketId,
      reason,
      side: intent.side,
    });

    logger.debug('Trade rejected by risk engine', {
      market: intent.marketId,
      reason,
    });

    return { approved: false, reason };
  }
}

export const riskEngine = new RiskEngine();
