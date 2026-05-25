// ─── Event name constants ─────────────────────────────────────────────────────

export const EVENTS = {
  MARKET_UPDATED:         'market.updated',
  SIGNAL_GENERATED:       'signal.generated',
  TRADE_REQUESTED:        'trade.requested',
  TRADE_APPROVED:         'trade.approved',
  TRADE_REJECTED:         'trade.rejected',
  ORDER_SUBMITTED:        'order.submitted',
  ORDER_FILLED:           'order.filled',
  ORDER_PARTIAL_FILL:     'order.partial_fill',
  ORDER_FAILED:           'order.failed',
  ORDER_CANCELLED:        'order.cancelled',
  POSITION_OPENED:        'position.opened',
  POSITION_CLOSED:        'position.closed',
  POSITION_DISPUTED:      'position.disputed',
  POSITION_INVALIDATED:   'position.invalidated',
  RISK_LIMIT_HIT:         'risk.limit_hit',
  DAILY_LOSS_HIT:         'risk.daily_loss_hit',
  BOT_PAUSED:             'bot.paused',
  BOT_RESUMED:            'bot.resumed',
  EMERGENCY_STOPPED:      'bot.emergency_stopped',
  STATE_CHANGED:          'bot.state_changed',
  PHASE_TRANSITION:       'bot.phase_transition',
  CIRCUIT_BREAKER_OPEN:   'circuit_breaker.opened',
  CIRCUIT_BREAKER_CLOSED: 'circuit_breaker.closed',
  WALLET_LOW_BALANCE:     'wallet.low_balance',
  WALLET_LOW_MATIC:       'wallet.low_matic',
  DAILY_SNAPSHOT:         'daily.snapshot',
  RECONCILE_COMPLETE:     'reconcile.complete',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

// ─── Payload types per event ──────────────────────────────────────────────────

export interface MarketUpdatedPayload {
  marketId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  regime: string;
}

export interface SignalGeneratedPayload {
  marketId: string;
  question: string;
  side: 'YES' | 'NO';
  trueProb: number;
  ev: number;
  suggestedSize: number;
  strategyName: string;
}

export interface TradeRequestedPayload {
  marketId: string;
  question: string;
  side: 'YES' | 'NO';
  size: number;
  price: number;
  trueProb: number;
  ev: number;
  strategyName: string;
}

export interface TradeApprovedPayload {
  marketId: string;
  side: 'YES' | 'NO';
  size: number;
  price: number;
}

export interface TradeRejectedPayload {
  marketId: string;
  reason: string;
  side?: 'YES' | 'NO';
}

export interface OrderSubmittedPayload {
  tradeId: number;
  orderId: string;
  marketId: string;
  question: string;
  side: 'YES' | 'NO';
  size: number;
  price: number;
}

export interface OrderFilledPayload {
  tradeId: number;
  orderId: string;
  marketId: string;
  question: string;
  side: 'YES' | 'NO';
  size: number;
  fillPrice: number;
  pnl?: number;
}

export interface OrderPartialFillPayload {
  tradeId: number;
  orderId: string;
  marketId: string;
  filled: number;
  remaining: number;
  fillPrice: number;
}

export interface OrderFailedPayload {
  marketId: string;
  reason: string;
  error?: string;
}

export interface OrderCancelledPayload {
  tradeId: number;
  orderId: string;
  marketId: string;
}

export interface PositionOpenedPayload {
  tradeId: number;
  marketId: string;
  question: string;
  side: 'YES' | 'NO';
  size: number;
  price: number;
}

export interface PositionClosedPayload {
  tradeId: number;
  marketId: string;
  question: string;
  pnl: number;
  outcome: 'win' | 'loss';
  holdTimeMs: number;
}

export interface PositionDisputedPayload {
  tradeId: number;
  marketId: string;
  notes: string;
}

export interface PositionInvalidatedPayload {
  tradeId: number;
  marketId: string;
}

export interface RiskLimitHitPayload {
  reason: string;
  marketId?: string;
  value?: number;
  limit?: number;
}

export interface DailyLossHitPayload {
  currentLoss: number;
  limit: number;
}

export interface BotPausedPayload {
  reason: string;
  winRate?: number;
}

export interface BotResumedPayload {
  by: 'dashboard_user' | 'auto';
}

export interface StateChangedPayload {
  from: string;
  to: string;
}

export interface PhaseTransitionPayload {
  from: number;
  to: number;
}

export interface CircuitBreakerPayload {
  name: string;
  state: 'OPEN' | 'CLOSED' | 'HALF_OPEN';
  failures?: number;
}

export interface WalletLowBalancePayload {
  balance: number;
  minimum: number;
}

export interface WalletLowMaticPayload {
  balance: number;
  minimum: number;
}

export interface DailySnapshotPayload {
  date: string;
  pnl: number;
  tradesPlaced: number;
  winRate: number;
  endingBalance: number;
  mode: 'demo' | 'live';
}

export interface ReconcileCompletePayload {
  type: 'orders' | 'fills' | 'balances' | 'positions';
  processed: number;
  fixed: number;
}

// ─── Event → Payload mapping (used by TypedEventBus) ─────────────────────────

export interface EventPayloads {
  [EVENTS.MARKET_UPDATED]:         MarketUpdatedPayload;
  [EVENTS.SIGNAL_GENERATED]:       SignalGeneratedPayload;
  [EVENTS.TRADE_REQUESTED]:        TradeRequestedPayload;
  [EVENTS.TRADE_APPROVED]:         TradeApprovedPayload;
  [EVENTS.TRADE_REJECTED]:         TradeRejectedPayload;
  [EVENTS.ORDER_SUBMITTED]:        OrderSubmittedPayload;
  [EVENTS.ORDER_FILLED]:           OrderFilledPayload;
  [EVENTS.ORDER_PARTIAL_FILL]:     OrderPartialFillPayload;
  [EVENTS.ORDER_FAILED]:           OrderFailedPayload;
  [EVENTS.ORDER_CANCELLED]:        OrderCancelledPayload;
  [EVENTS.POSITION_OPENED]:        PositionOpenedPayload;
  [EVENTS.POSITION_CLOSED]:        PositionClosedPayload;
  [EVENTS.POSITION_DISPUTED]:      PositionDisputedPayload;
  [EVENTS.POSITION_INVALIDATED]:   PositionInvalidatedPayload;
  [EVENTS.RISK_LIMIT_HIT]:         RiskLimitHitPayload;
  [EVENTS.DAILY_LOSS_HIT]:         DailyLossHitPayload;
  [EVENTS.BOT_PAUSED]:             BotPausedPayload;
  [EVENTS.BOT_RESUMED]:            BotResumedPayload;
  [EVENTS.EMERGENCY_STOPPED]:      Record<string, never>;
  [EVENTS.STATE_CHANGED]:          StateChangedPayload;
  [EVENTS.PHASE_TRANSITION]:       PhaseTransitionPayload;
  [EVENTS.CIRCUIT_BREAKER_OPEN]:   CircuitBreakerPayload;
  [EVENTS.CIRCUIT_BREAKER_CLOSED]: CircuitBreakerPayload;
  [EVENTS.WALLET_LOW_BALANCE]:     WalletLowBalancePayload;
  [EVENTS.WALLET_LOW_MATIC]:       WalletLowMaticPayload;
  [EVENTS.DAILY_SNAPSHOT]:         DailySnapshotPayload;
  [EVENTS.RECONCILE_COMPLETE]:     ReconcileCompletePayload;
}
