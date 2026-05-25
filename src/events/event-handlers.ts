import { eventBus } from './event-bus.js';
import { EVENTS } from './event-types.js';
import { audit } from '../utils/audit.js';
import { logger } from '../utils/logger.js';

// ─── Core event handlers (audit + logging) ────────────────────────────────────
// Called once at startup from src/index.ts.
// Telegram handlers are added in Phase 10 via registerTelegramHandlers().
// Analytics handlers are added in Phase 10 via registerAnalyticsHandlers().

export function registerEventHandlers(): void {
  // ── Audit trail ─────────────────────────────────────────────────────────────

  eventBus.on(EVENTS.STATE_CHANGED, (p) => {
    void audit('state.changed', {
      previousValue: { state: p.from },
      newValue: { state: p.to },
    });
  });

  eventBus.on(EVENTS.TRADE_REJECTED, (p) => {
    void audit('trade.rejected', {
      entityType: 'market',
      entityId: p.marketId,
      reason: p.reason,
    });
  });

  eventBus.on(EVENTS.EMERGENCY_STOPPED, () => {
    void audit('bot.emergency_stopped', {});
  });

  eventBus.on(EVENTS.PHASE_TRANSITION, (p) => {
    void audit('phase.transition', {
      previousValue: { phase: p.from },
      newValue: { phase: p.to },
    });
  });

  eventBus.on(EVENTS.BOT_PAUSED, (p) => {
    void audit('bot.paused', { reason: p.reason, newValue: { winRate: p.winRate } });
  });

  eventBus.on(EVENTS.BOT_RESUMED, (p) => {
    void audit('bot.resumed', { newValue: { by: p.by } });
  });

  eventBus.on(EVENTS.CIRCUIT_BREAKER_OPEN, (p) => {
    void audit('circuit_breaker.opened', {
      entityId: p.name,
      newValue: { state: p.state, failures: p.failures },
    });
  });

  eventBus.on(EVENTS.CIRCUIT_BREAKER_CLOSED, (p) => {
    void audit('circuit_breaker.closed', {
      entityId: p.name,
      newValue: { state: p.state },
    });
  });

  // ── Structured logging ───────────────────────────────────────────────────────

  eventBus.on(EVENTS.ORDER_SUBMITTED, (p) => {
    logger.trade('Order submitted', {
      marketId: p.marketId,
      side: p.side,
      size: p.size,
      price: p.price,
    });
  });

  eventBus.on(EVENTS.ORDER_FILLED, (p) => {
    logger.trade('Order filled', {
      marketId: p.marketId,
      side: p.side,
      size: p.size,
      fillPrice: p.fillPrice,
      pnl: p.pnl,
    });
  });

  eventBus.on(EVENTS.ORDER_PARTIAL_FILL, (p) => {
    logger.trade('Partial fill', {
      marketId: p.marketId,
      filled: p.filled,
      remaining: p.remaining,
    });
  });

  eventBus.on(EVENTS.ORDER_FAILED, (p) => {
    logger.error('Order failed', { marketId: p.marketId, reason: p.reason, error: p.error });
  });

  eventBus.on(EVENTS.TRADE_REJECTED, (p) => {
    logger.warn('Trade rejected', { marketId: p.marketId, reason: p.reason });
  });

  eventBus.on(EVENTS.RISK_LIMIT_HIT, (p) => {
    logger.warn('Risk limit hit', { reason: p.reason, value: p.value, limit: p.limit });
  });

  eventBus.on(EVENTS.DAILY_LOSS_HIT, (p) => {
    logger.warn('Daily loss limit reached', { loss: p.currentLoss, limit: p.limit });
  });

  eventBus.on(EVENTS.CIRCUIT_BREAKER_OPEN, (p) => {
    logger.error('Circuit breaker OPEN', { name: p.name, failures: p.failures });
  });

  eventBus.on(EVENTS.CIRCUIT_BREAKER_CLOSED, (p) => {
    logger.info('Circuit breaker CLOSED', { name: p.name });
  });

  eventBus.on(EVENTS.WALLET_LOW_BALANCE, (p) => {
    logger.warn('Low USDC balance', { balance: p.balance, minimum: p.minimum });
  });

  eventBus.on(EVENTS.WALLET_LOW_MATIC, (p) => {
    logger.warn('Low MATIC balance', { balance: p.balance, minimum: p.minimum });
  });

  eventBus.on(EVENTS.EMERGENCY_STOPPED, () => {
    logger.error('EMERGENCY STOP triggered');
  });

  eventBus.on(EVENTS.POSITION_CLOSED, (p) => {
    logger.trade('Position closed', {
      marketId: p.marketId,
      outcome: p.outcome,
      pnl: p.pnl,
      holdTimeMs: p.holdTimeMs,
    });
  });

  eventBus.on(EVENTS.POSITION_DISPUTED, (p) => {
    logger.warn('Position disputed', { marketId: p.marketId, notes: p.notes });
  });

  eventBus.on(EVENTS.DAILY_SNAPSHOT, (p) => {
    logger.info('Daily snapshot', {
      date: p.date,
      pnl: p.pnl,
      trades: p.tradesPlaced,
      winRate: p.winRate,
    });
  });

  logger.info('Event handlers registered.');
}

// ─── Extended registration hooks (called from later phases) ──────────────────

export type TelegramClient = {
  info: (msg: string) => void;
  warning: (msg: string) => void;
  critical: (msg: string) => void;
  fatal: (msg: string) => void;
};

export type AnalyticsClient = {
  recordFill: (p: unknown) => void;
  recordClose: (p: unknown) => void;
  recordRejection: (p: unknown) => void;
};

export function registerTelegramHandlers(telegram: TelegramClient): void {
  eventBus.on(EVENTS.ORDER_FILLED, (p) =>
    telegram.info(`Trade filled: ${p.side} $${p.size.toFixed(2)} @ ${p.fillPrice}`),
  );
  eventBus.on(EVENTS.RISK_LIMIT_HIT, (p) => telegram.warning(`Risk limit: ${p.reason}`));
  eventBus.on(EVENTS.DAILY_LOSS_HIT, (p) =>
    telegram.warning(`Daily loss limit hit: -$${Math.abs(p.currentLoss).toFixed(2)}`),
  );
  eventBus.on(EVENTS.CIRCUIT_BREAKER_OPEN, (p) =>
    telegram.critical(`Circuit breaker OPEN: ${p.name}`),
  );
  eventBus.on(EVENTS.EMERGENCY_STOPPED, () => telegram.fatal('Emergency stop triggered'));
  eventBus.on(EVENTS.WALLET_LOW_BALANCE, (p) =>
    telegram.warning(`Low USDC balance: $${p.balance.toFixed(2)}`),
  );
  eventBus.on(EVENTS.WALLET_LOW_MATIC, (p) =>
    telegram.warning(`Low MATIC balance: ${p.balance.toFixed(4)}`),
  );
  eventBus.on(EVENTS.DAILY_SNAPSHOT, (p) =>
    telegram.info(
      `Daily PnL [${p.mode}]: ${p.pnl >= 0 ? '+' : ''}$${p.pnl.toFixed(2)} | Win rate: ${p.winRate.toFixed(1)}%`,
    ),
  );
  eventBus.on(EVENTS.PHASE_TRANSITION, (p) =>
    telegram.info(`Onboarding phase ${p.from} → ${p.to} unlocked`),
  );

  logger.info('Telegram event handlers registered.');
}

export function registerAnalyticsHandlers(analytics: AnalyticsClient): void {
  eventBus.on(EVENTS.ORDER_FILLED, (p) => analytics.recordFill(p));
  eventBus.on(EVENTS.POSITION_CLOSED, (p) => analytics.recordClose(p));
  eventBus.on(EVENTS.TRADE_REJECTED, (p) => analytics.recordRejection(p));

  logger.info('Analytics event handlers registered.');
}
