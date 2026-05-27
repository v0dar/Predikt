import type { Context } from 'grammy';

// ─── Roles ────────────────────────────────────────────────────────────────────

export type Role = 'OWNER' | 'ADMIN' | 'VIEWER' | 'UNAUTHORIZED';

export interface AuthenticatedUser {
  telegramId: number;
  username:   string | undefined;
  firstName:  string;
  role:       Role;
}

// ─── Bot context ──────────────────────────────────────────────────────────────

export interface BotContext extends Context {
  user: AuthenticatedUser;
}

// ─── Admin API response shapes ────────────────────────────────────────────────

export interface BotStatusResponse {
  state:            string;
  running:          boolean;
  dry_run:          boolean;
  mode:             string;
  uptime_seconds:   number;
  usdc_balance:     number | null;
  matic_balance:    number | null;
  open_positions:   number;
  current_regime:   string;
  circuit_breakers: Record<string, unknown> | null;
  last_scan_at:     string | null;
  next_scan_at:     string | null;
  updated_at:       string;
}

export interface HealthCheck {
  supabase:     'ok' | 'error';
  redis:        'ok' | 'error';
  stateMachine: string;
  uptime:       number;
}

export interface HealthResponse {
  status:    'ok' | 'degraded' | 'error';
  checks:    HealthCheck;
  timestamp: string;
}

export interface SignalItem {
  market_id:     string;
  question:      string;
  yes_price:     number;
  no_price:      number;
  spread:        number | null;
  volume_usd:    number | null;
  liquidity_usd: number | null;
  regime:        string | null;
  end_date:      string | null;
  snapped_at:    string;
}

export interface PositionItem {
  id:             number;
  market_question: string | null;
  side:           'YES' | 'NO';
  price:          number;
  size:           number;
  size_filled:    number;
  status:         string;
  placed_at:      string;
  mode:           string;
}

export interface PortfolioResponse {
  total_balance:  number | null;
  open_positions: number;
  total_exposure: number;
  today_pnl:      number | null;
  today_trades:   number;
  mode:           string;
  regime:         string;
}

export interface TradeItem {
  id:              number;
  market_question: string | null;
  side:            'YES' | 'NO';
  price:           number;
  size:            number;
  status:          string;
  pnl:             number | null;
  placed_at:       string;
  mode:            string;
}

export interface RiskResponse {
  daily_loss_today:       number | null;
  daily_loss_limit:       number;
  open_positions:         number;
  max_positions:          number;
  total_exposure:         number;
  max_bet_usd:            number;
  min_edge_percent:       number;
  circuit_breakers:       Record<string, unknown> | null;
  current_drawdown_pct:   number;
}

export interface ModeResponse {
  mode:      string;
  dry_run:   boolean;
  strategy:  string;
  state:     string;
}

export interface ActionResponse {
  success:  boolean;
  state?:   string;
  message?: string;
  error?:   string;
}

// ─── Alert types (used by dispatcher + commands) ──────────────────────────────

export type AlertPriority = 'INFO' | 'WARNING' | 'CRITICAL' | 'FATAL';

export interface AlertPayload {
  priority:  AlertPriority;
  title:     string;
  body:      string;
  timestamp: string;
}
