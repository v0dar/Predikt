-- ═══════════════════════════════════════════════════════════════════════════
-- Predikt — Full Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════
-- CORE TABLES
-- ═══════════════════════════════════════════════

CREATE TABLE markets (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  category TEXT,
  end_date TIMESTAMPTZ,
  volume_usd NUMERIC,
  liquidity_usd NUMERIC,
  last_scanned_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE blacklisted_markets (
  market_id TEXT PRIMARY KEY,
  market_question TEXT,
  reason TEXT,
  blacklisted_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE trades (
  id BIGSERIAL PRIMARY KEY,
  market_id TEXT REFERENCES markets(id),
  market_question TEXT,
  order_id TEXT UNIQUE,
  side TEXT NOT NULL,                    -- YES | NO
  price NUMERIC NOT NULL,                -- 0.0–1.0
  size NUMERIC NOT NULL,                 -- USDC staked
  size_filled NUMERIC DEFAULT 0,
  size_remaining NUMERIC,
  avg_fill_price NUMERIC,
  true_prob NUMERIC,
  ev NUMERIC,
  kelly_size NUMERIC,
  status TEXT DEFAULT 'open',            -- open | partial | filled | cancelled | resolved | expired
  position_state TEXT DEFAULT 'OPENING', -- OPENING | OPEN | SCALING_IN | CLOSING | CLOSED | FAILED
  outcome TEXT,                          -- win | loss | null
  pnl NUMERIC,
  resolution_status TEXT DEFAULT 'pending', -- pending | confirmed | disputed | invalidated
  resolution_source TEXT,
  dispute_notes TEXT,
  strategy_name TEXT,
  regime TEXT,
  mode TEXT DEFAULT 'demo',              -- demo | live
  placed_at TIMESTAMPTZ DEFAULT now(),
  filled_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE fills (
  id BIGSERIAL PRIMARY KEY,
  trade_id BIGINT REFERENCES trades(id),
  fill_size NUMERIC NOT NULL,
  fill_price NUMERIC NOT NULL,
  cumulative_filled NUMERIC,
  remaining_size NUMERIC,
  slippage NUMERIC,
  execution_latency_ms INTEGER,
  fill_type TEXT DEFAULT 'partial',      -- partial | complete
  filled_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pnl_snapshots (
  date DATE PRIMARY KEY,
  starting_balance NUMERIC,
  ending_balance NUMERIC,
  trades_placed INTEGER DEFAULT 0,
  trades_won INTEGER DEFAULT 0,
  trades_lost INTEGER DEFAULT 0,
  net_pnl NUMERIC,
  roi_percent NUMERIC,
  mode TEXT DEFAULT 'live'
);

-- ═══════════════════════════════════════════════
-- DEMO MODE TABLES
-- ═══════════════════════════════════════════════

CREATE TABLE demo_trades (
  id BIGSERIAL PRIMARY KEY,
  market_id TEXT REFERENCES markets(id),
  market_question TEXT,
  side TEXT NOT NULL,
  price NUMERIC NOT NULL,
  size NUMERIC NOT NULL,
  true_prob NUMERIC,
  ev NUMERIC,
  kelly_size NUMERIC,
  status TEXT DEFAULT 'open',
  outcome TEXT,
  pnl NUMERIC,
  strategy_name TEXT,
  regime TEXT,
  placed_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE demo_balance_snapshots (
  date DATE PRIMARY KEY,
  starting_balance NUMERIC,
  ending_balance NUMERIC,
  trades_placed INTEGER DEFAULT 0,
  trades_won INTEGER DEFAULT 0,
  trades_lost INTEGER DEFAULT 0,
  net_pnl NUMERIC,
  roi_percent NUMERIC
);

-- ═══════════════════════════════════════════════
-- BOT CONFIGURATION & STATUS
-- ═══════════════════════════════════════════════

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('MODE',                         'demo'),
  ('DEMO_STARTING_BALANCE',        '500'),
  ('DEMO_CURRENT_BALANCE',         '500'),
  ('MAX_BET_USD',                  '10'),
  ('MAX_BET_PERCENT',              '5'),
  ('AUTO_SCALE_BETS',              'false'),
  ('MIN_EDGE_PERCENT',             '5'),
  ('KELLY_FRACTION',               '0.25'),
  ('MAX_OPEN_POSITIONS',           '5'),
  ('CRON_SCHEDULE',                '*/5 * * * *'),
  ('DRY_RUN',                      'true'),
  ('DAILY_LOSS_LIMIT_USD',         '50'),
  ('MAX_SLIPPAGE_PERCENT',         '2'),
  ('MIN_LIQUIDITY_MULTIPLIER',     '3'),
  ('AUTO_PAUSE_WIN_RATE_THRESHOLD','40'),
  ('AUTO_PAUSE_LOOKBACK_TRADES',   '20'),
  ('MIN_MATIC_BALANCE',            '0.5'),
  ('TELEGRAM_NOTIFICATIONS',       'false'),
  ('STRATEGY',                     'value-bet')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE settings_history (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT NOT NULL,
  changed_by TEXT DEFAULT 'dashboard_user',
  note TEXT,
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION log_settings_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO settings_history (key, previous_value, new_value)
  VALUES (NEW.key, OLD.value, NEW.value);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settings_audit
AFTER UPDATE ON settings
FOR EACH ROW EXECUTE FUNCTION log_settings_change();

CREATE TABLE bot_status (
  id INTEGER PRIMARY KEY DEFAULT 1,
  state TEXT DEFAULT 'BOOTING',
  running BOOLEAN DEFAULT false,
  dry_run BOOLEAN DEFAULT true,
  mode TEXT DEFAULT 'demo',
  uptime_seconds INTEGER DEFAULT 0,
  usdc_balance NUMERIC,
  matic_balance NUMERIC,
  open_positions INTEGER DEFAULT 0,
  current_regime TEXT DEFAULT 'NORMAL',
  circuit_breakers JSONB,
  last_scan_at TIMESTAMPTZ,
  next_scan_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CHECK (id = 1)
);

INSERT INTO bot_status (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════
-- BACKTESTING
-- ═══════════════════════════════════════════════

CREATE TABLE market_snapshots (
  id BIGSERIAL PRIMARY KEY,
  market_id TEXT,
  market_question TEXT,
  category TEXT,
  yes_price NUMERIC,
  no_price NUMERIC,
  best_bid NUMERIC,
  best_ask NUMERIC,
  spread NUMERIC,
  volume_usd NUMERIC,
  liquidity_usd NUMERIC,
  regime TEXT,
  end_date TIMESTAMPTZ,
  resolved BOOLEAN DEFAULT false,
  resolution TEXT,                       -- YES | NO | INVALID | null
  snapped_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE backtest_runs (
  id BIGSERIAL PRIMARY KEY,
  strategy_name TEXT,
  date_from TIMESTAMPTZ,
  date_to TIMESTAMPTZ,
  starting_balance NUMERIC,
  ending_balance NUMERIC,
  total_trades INTEGER,
  winning_trades INTEGER,
  win_rate NUMERIC,
  total_pnl NUMERIC,
  roi_percent NUMERIC,
  sharpe_ratio NUMERIC,
  max_drawdown NUMERIC,
  avg_ev_at_entry NUMERIC,
  settings_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════
-- OBSERVABILITY
-- ═══════════════════════════════════════════════

CREATE TABLE bot_logs (
  id BIGSERIAL PRIMARY KEY,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT DEFAULT 'bot',
  entity_type TEXT,
  entity_id TEXT,
  previous_value JSONB,
  new_value JSONB,
  reason TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════
-- ONBOARDING
-- ═══════════════════════════════════════════════

CREATE TABLE onboarding (
  id INTEGER PRIMARY KEY DEFAULT 1,
  current_phase INTEGER DEFAULT 1,
  phase1_started_at TIMESTAMPTZ DEFAULT now(),
  phase1_completed_at TIMESTAMPTZ,
  phase2_started_at TIMESTAMPTZ,
  phase2_completed_at TIMESTAMPTZ,
  phase3_started_at TIMESTAMPTZ,
  demo_trades_count INTEGER DEFAULT 0,
  demo_win_rate NUMERIC DEFAULT 0,
  live_trades_count INTEGER DEFAULT 0,
  live_win_rate NUMERIC DEFAULT 0,
  checklist_dismissed BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CHECK (id = 1)
);

INSERT INTO onboarding (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════

CREATE VIEW positions AS
SELECT
  t.*,
  COALESCE(SUM(f.fill_size), 0) AS total_filled,
  COUNT(f.id) AS fill_count,
  AVG(f.fill_price) AS weighted_avg_price
FROM trades t
LEFT JOIN fills f ON f.trade_id = t.id
WHERE t.status NOT IN ('cancelled', 'expired', 'resolved')
GROUP BY t.id;

-- ═══════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════

ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklisted_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE pnl_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding ENABLE ROW LEVEL SECURITY;

-- Authenticated users (dashboard) — read all, write select tables
CREATE POLICY "read_markets"            ON markets                  FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage_blacklist"        ON blacklisted_markets       FOR ALL    TO authenticated USING (true);
CREATE POLICY "read_trades"             ON trades                    FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_fills"              ON fills                     FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_pnl"               ON pnl_snapshots             FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_demo_trades"        ON demo_trades               FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_demo_balance"       ON demo_balance_snapshots     FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_settings"           ON settings                  FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_settings"          ON settings                  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "read_settings_history"   ON settings_history          FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_bot_status"         ON bot_status                FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_logs"              ON bot_logs                  FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_audit"             ON audit_logs                FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_snapshots"          ON market_snapshots          FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage_backtests"        ON backtest_runs             FOR ALL    TO authenticated USING (true);
CREATE POLICY "manage_onboarding"       ON onboarding                FOR ALL    TO authenticated USING (true);

-- Service role (bot) bypasses RLS automatically — no policy needed
