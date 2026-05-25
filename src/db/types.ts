// ─── Row types (mirror DB columns exactly) ───────────────────────────────────

export interface Market {
  id: string;
  question: string;
  category: string | null;
  end_date: string | null;
  volume_usd: number | null;
  liquidity_usd: number | null;
  last_scanned_at: string;
}

export interface BlacklistedMarket {
  market_id: string;
  market_question: string | null;
  reason: string | null;
  blacklisted_at: string;
}

export type TradeStatus = 'open' | 'partial' | 'filled' | 'cancelled' | 'resolved' | 'expired';
export type PositionState = 'OPENING' | 'OPEN' | 'SCALING_IN' | 'CLOSING' | 'CLOSED' | 'FAILED';
export type TradeOutcome = 'win' | 'loss';
export type ResolutionStatus = 'pending' | 'confirmed' | 'disputed' | 'invalidated';
export type TradeMode = 'demo' | 'live';

export interface Trade {
  id: number;
  market_id: string | null;
  market_question: string | null;
  order_id: string | null;
  side: 'YES' | 'NO';
  price: number;
  size: number;
  size_filled: number;
  size_remaining: number | null;
  avg_fill_price: number | null;
  true_prob: number | null;
  ev: number | null;
  kelly_size: number | null;
  status: TradeStatus;
  position_state: PositionState;
  outcome: TradeOutcome | null;
  pnl: number | null;
  resolution_status: ResolutionStatus;
  resolution_source: string | null;
  dispute_notes: string | null;
  strategy_name: string | null;
  regime: string | null;
  mode: TradeMode;
  placed_at: string;
  filled_at: string | null;
  resolved_at: string | null;
}

export interface Fill {
  id: number;
  trade_id: number | null;
  fill_size: number;
  fill_price: number;
  cumulative_filled: number | null;
  remaining_size: number | null;
  slippage: number | null;
  execution_latency_ms: number | null;
  fill_type: 'partial' | 'complete';
  filled_at: string;
}

export interface PnlSnapshot {
  date: string;
  starting_balance: number | null;
  ending_balance: number | null;
  trades_placed: number;
  trades_won: number;
  trades_lost: number;
  net_pnl: number | null;
  roi_percent: number | null;
  mode: TradeMode;
}

export interface DemoTrade {
  id: number;
  market_id: string | null;
  market_question: string | null;
  side: 'YES' | 'NO';
  price: number;
  size: number;
  true_prob: number | null;
  ev: number | null;
  kelly_size: number | null;
  status: TradeStatus;
  outcome: TradeOutcome | null;
  pnl: number | null;
  strategy_name: string | null;
  regime: string | null;
  placed_at: string;
  resolved_at: string | null;
}

export interface DemoBalanceSnapshot {
  date: string;
  starting_balance: number | null;
  ending_balance: number | null;
  trades_placed: number;
  trades_won: number;
  trades_lost: number;
  net_pnl: number | null;
  roi_percent: number | null;
}

export interface SettingsRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface SettingsHistoryRow {
  id: number;
  key: string;
  previous_value: string | null;
  new_value: string;
  changed_by: string;
  note: string | null;
  changed_at: string;
}

export type BotState =
  | 'BOOTING'
  | 'SYNCING'
  | 'READY'
  | 'SCANNING'
  | 'PLACING_ORDER'
  | 'WAITING_CONFIRMATION'
  | 'PAUSED'
  | 'ERROR_RECOVERY'
  | 'EMERGENCY_STOPPED'
  | 'SHUTTING_DOWN';

export interface BotStatus {
  id: 1;
  state: BotState;
  running: boolean;
  dry_run: boolean;
  mode: TradeMode;
  uptime_seconds: number;
  usdc_balance: number | null;
  matic_balance: number | null;
  open_positions: number;
  current_regime: string;
  circuit_breakers: Record<string, string> | null;
  last_scan_at: string | null;
  next_scan_at: string | null;
  updated_at: string;
}

export interface MarketSnapshot {
  id: number;
  market_id: string | null;
  market_question: string | null;
  category: string | null;
  yes_price: number | null;
  no_price: number | null;
  best_bid: number | null;
  best_ask: number | null;
  spread: number | null;
  volume_usd: number | null;
  liquidity_usd: number | null;
  regime: string | null;
  end_date: string | null;
  resolved: boolean;
  resolution: 'YES' | 'NO' | 'INVALID' | null;
  snapped_at: string;
}

export interface BacktestRun {
  id: number;
  strategy_name: string | null;
  date_from: string | null;
  date_to: string | null;
  starting_balance: number | null;
  ending_balance: number | null;
  total_trades: number | null;
  winning_trades: number | null;
  win_rate: number | null;
  total_pnl: number | null;
  roi_percent: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  avg_ev_at_entry: number | null;
  settings_snapshot: Record<string, string> | null;
  created_at: string;
}

export interface BotLog {
  id: number;
  level: 'info' | 'warn' | 'error' | 'debug' | 'trade' | 'audit';
  message: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  action: string;
  actor: 'bot' | 'dashboard_user';
  entity_type: string | null;
  entity_id: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface Onboarding {
  id: 1;
  current_phase: number;
  phase1_started_at: string | null;
  phase1_completed_at: string | null;
  phase2_started_at: string | null;
  phase2_completed_at: string | null;
  phase3_started_at: string | null;
  demo_trades_count: number;
  demo_win_rate: number;
  live_trades_count: number;
  live_win_rate: number;
  checklist_dismissed: boolean;
  updated_at: string;
}

// `positions` view extends Trade with aggregated fill data
export interface Position extends Trade {
  total_filled: number;
  fill_count: number;
  weighted_avg_price: number | null;
}

// ─── Parsed settings (typed values) ──────────────────────────────────────────

export interface BotSettings {
  MODE: TradeMode;
  DEMO_STARTING_BALANCE: number;
  DEMO_CURRENT_BALANCE: number;
  MAX_BET_USD: number;
  MAX_BET_PERCENT: number;
  AUTO_SCALE_BETS: boolean;
  MIN_EDGE_PERCENT: number;
  KELLY_FRACTION: number;
  MAX_OPEN_POSITIONS: number;
  CRON_SCHEDULE: string;
  DRY_RUN: boolean;
  DAILY_LOSS_LIMIT_USD: number;
  MAX_SLIPPAGE_PERCENT: number;
  MIN_LIQUIDITY_MULTIPLIER: number;
  AUTO_PAUSE_WIN_RATE_THRESHOLD: number;
  AUTO_PAUSE_LOOKBACK_TRADES: number;
  MIN_MATIC_BALANCE: number;
  TELEGRAM_NOTIFICATIONS: boolean;
  STRATEGY: string;
}

// ─── Insert helpers (omit auto-generated fields) ──────────────────────────────

export type InsertFill = Omit<Fill, 'id' | 'filled_at'> & { filled_at?: string };
export type InsertBotLog = Omit<BotLog, 'id' | 'created_at'>;
export type InsertAuditLog = Omit<AuditLog, 'id' | 'created_at'>;
export type BotStatusUpdate = Partial<Omit<BotStatus, 'id'>>;
