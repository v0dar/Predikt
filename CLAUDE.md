# Predikt — Polymarket Trading Bot

> **This file is the single source of truth for Claude Code.**
> It contains both the full architecture specification and the build instructions.
> Build each phase in order. Do not skip phases.

---

## CRITICAL RULES — READ BEFORE WRITING A SINGLE LINE

- Do NOT redesign the architecture
- Do NOT introduce frameworks not listed in the architecture (no Prisma, no BullMQ, no Fastify — we use Supabase, node-cron, Redis + Redlock, Express)
- Do NOT collapse modules together — every file in the directory structure must exist as its own file
- Do NOT generate placeholder or stub implementations — every file must be complete and working
- Do NOT move to the next phase until the current phase compiles, runs, and passes its test
- Do NOT skip package installation commands
- Do NOT assume any configuration already exists
- Keep all code production-grade with full TypeScript strict typing
- Use Node.js ESM (`"type": "module"` in package.json, `.ts` imports use `.js` extensions)
- Maintain clean separation of concerns at all times

## DASHBOARD RULES (enforce strictly)

- The dashboard is a **Single Page Application (SPA)**. There is ONE shell file (`shell.html`). The Express server returns this shell for all page routes. The client-side router (`router.js`) handles all navigation.
- **No full page reloads — ever.** Navigation swaps only `#main-content`. Both sidebars are permanent for the lifetime of the session.
- **No polling for data refresh.** All live data comes from Supabase Realtime subscriptions wired in `realtime.js`. Page-level listeners (`window.onTradeChange`, `window.onStatusUpdate`, `window.onLogInsert`, `window.onSettingsChange`) are set in each page's `init()` and cleared in its cleanup function.
- **All data fades in gracefully.** The router fades out old content (150ms), swaps HTML, then fades in new content (250ms). Tables use `.fade-row` animation on each `<tr>`. No jarring repaints.
- **Two persistent sidebars** (Spotify-style dual sidebar):
  - Left sidebar (300px): Sectioned nav (HOME / MARKETS / BOT) with section labels. Active nav item gets full-width `--accent-primary` background highlight. Logo at top, bot status badge + USDC balance + sign-out at bottom.
  - Right sidebar (300px): Three tabs — Status (live bot stats), Activity (live log feed), Alerts (critical warnings). Tabs are client-side only, no page change.
- **UI stack**: Bootstrap 5.3.x CDN + Bootstrap Icons CDN. No Tailwind. No other CSS frameworks.
- **Chart.js instances** must be destroyed in each page's cleanup function (`return () => { chart.destroy(); }`) to prevent canvas reuse errors.
- **`moduleResolution`** in `tsconfig.json` is `"bundler"` (not `"node"` — deprecated in TS 7+).

### Dashboard file structure
```
src/dashboard/public/
  shell.html          ← SPA shell served for ALL page routes
  login.html          ← Standalone auth page (outside SPA)
  favicon.svg
  logo.svg
  css/
    theme.css         ← All CSS variables, layout, components
  js/
    app.js            ← Supabase init, auth, sidebar injection, shared utils
    router.js         ← History API router with fade transitions
    realtime.js       ← Supabase Realtime — all persistent subscriptions
    charts.js         ← Chart.js factory functions
    pages/
      home.js         ← registers route '/'
      trades.js       ← registers route '/trades'
      markets.js      ← registers route '/markets'
      analytics.js    ← registers route '/analytics'
      backtesting.js  ← registers route '/backtesting'
      settings.js     ← registers route '/settings'
      logs.js         ← registers route '/logs'
      wallet.js       ← registers route '/wallet'
```

### Page module contract
Each page file must:
1. Call `router.register(path, { title, template(), async init() })` — no other exports
2. `template()` returns an HTML string for `#main-content`
3. `init()` sets up event listeners and page-level realtime hooks, returns a cleanup function
4. The cleanup function clears all `window.on*` listeners and destroys Chart.js instances

---

## ARCHITECTURE BOUNDARIES (enforce strictly)

| Module | Rule |
|---|---|
| Strategies (`src/strategy/`) | MUST return `TradeIntent[]` ONLY. No DB writes. No wallet calls. No API calls. |
| Risk Engine (`src/risk/engine.ts`) | MUST validate EVERY TradeIntent before it reaches execution. Nothing bypasses it. |
| Execution Engine (`src/execution/engine.ts`) | ONLY module that calls the CLOB. Must acquire Redis lock before every order. |
| Event Bus (`src/events/event-bus.ts`) | ALL inter-module communication goes through here. No direct module-to-module calls. |
| Reconciliation Engine (`src/reconciliation/`) | Runs independently. Syncs DB state against real Polymarket CLOB state. |
| Dashboard (`src/dashboard/`) | MUST NOT directly mutate execution state. All bot control goes via Express API routes which call the bot's internal modules. |
| State Machine (`src/core/state-machine.ts`) | Every operation checks state before executing. Invalid transitions throw — never silently pass. |

---

## TECH STACK (do not deviate)

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ with ESM |
| Language | TypeScript (strict mode) |
| Database | Supabase (@supabase/supabase-js) — NO Prisma |
| Scheduling | node-cron — NO BullMQ |
| Distributed Locking | Redis (ioredis) + Redlock |
| HTTP Server | Express.js — NO Fastify |
| Wallet / Web3 | ethers.js v6 |
| Logging | winston |
| Config Validation | Zod |
| Event Bus | Node.js EventEmitter (typed wrapper) |
| Process Manager | PM2 |
| Build | tsup |
| Linting | ESLint + Prettier |

---

## EXECUTION STYLE

- Work PHASE BY PHASE as defined below
- Complete one phase FULLY before starting the next
- After completing each phase, provide:
  1. Summary of every file built and its responsibility
  2. Why each module exists and how it connects to the architecture
  3. Full folder placement confirmation
  4. Every `npm install` command needed (exact package names + versions where critical)
  5. All environment variables required for this phase
  6. Exact commands to run to test this phase
  7. Expected terminal output if everything is working
  8. What the next phase will build

---

## OUTPUT FORMAT (for every file)

```
FILE: src/path/to/file.ts
RESPONSIBILITY: one sentence
CONNECTS TO: which other modules use this
---
[complete file contents — no placeholders, no TODOs, no "implement later"]
```

---

## PHASES

---

### PHASE 1 — PROJECT FOUNDATION ✅ COMPLETE

Initialize the full project structure.

**Built:**
1. `package.json` — all base dependencies, ESM config, scripts
2. `tsconfig.json` — strict mode, ESM, Node20 target
3. `tsup.config.ts` — build config
4. `.eslintrc.cjs` — TypeScript ESLint rules
5. `.prettierrc` — consistent formatting
6. `.env.example` — every environment variable with comments
7. `.gitignore` — node_modules, dist, .env, logs/, data/
8. Full folder structure — all directories with `.gitkeep`
9. `src/index.ts` — entry point with graceful shutdown
10. `src/dashboard/server.ts` — Express shell with `/health`, error handling, SIGTERM/SIGINT
11. `src/dashboard/public/favicon.svg` — 16×16 favicon
12. `src/dashboard/public/logo.svg` — 32×32 sidebar icon

**Dashboard port: 3003** (3000, 3001, 3002 are taken)

**Test:**
- `npm run build` → zero errors
- `npm run dev` → logs startup + `http://localhost:3002`
- `GET http://localhost:3002/health` → `{ status: 'ok', timestamp }`

---

### PHASE 2 — SUPABASE DATABASE LAYER

Set up the full Supabase schema and database client.

**Part A — SQL Schema**

Provide the COMPLETE SQL to run in the Supabase SQL Editor. Use the EXACT schema from the architecture including:
- All tables: `markets`, `blacklisted_markets`, `trades`, `fills`, `pnl_snapshots`, `demo_trades`, `demo_balance_snapshots`, `settings`, `settings_history`, `bot_status`, `market_snapshots`, `backtest_runs`, `bot_logs`, `audit_logs`, `onboarding`
- Settings trigger function (`log_settings_change`) and trigger (`settings_audit`)
- All default seed data for `settings` table
- `positions` view
- All `INSERT INTO bot_status` and `INSERT INTO onboarding` seed rows
- All Row Level Security policies

**Part B — TypeScript DB layer**

Generate:
1. `src/db/supabase.ts` — Supabase client singleton using service role key
2. `src/db/queries.ts` — Typed helper functions for every table

**Test for phase 2:**
- `npm run dev` logs "Supabase connection verified"
- Insert a test row into `bot_logs` and confirm it appears in Supabase dashboard
- Call `getAllSettings()` and confirm it returns the seeded settings

**Do NOT start Phase 3 until instructed.**

---

### PHASE 3 — CONFIG + LOGGING SYSTEM

Build the production-grade configuration and logging layer.

**Generate:**

1. `src/config/index.ts` — Master config loader with Zod validation
2. `src/config/trading.config.ts` — TradingConfig interface
3. `src/config/risk.config.ts` — RiskConfig interface
4. `src/config/execution.config.ts` — ExecutionConfig interface
5. `src/utils/logger.ts` — Winston logger (console + Supabase transport)
6. `src/utils/audit.ts` — Immutable audit trail writer

**Do NOT start Phase 4 until instructed.**

---

### PHASES 4–14 PREVIEW (do not build yet)

- **Phase 4** — Event Bus + State Machine + Redis Locking
- **Phase 5** — Polymarket API + CLOB Client + Wallet Signer + Math Utils
- **Phase 6** — Strategy Sandbox + Value-Bet Strategy + Market Scanner + Regime Detection
- **Phase 7** — Risk Engine + Circuit Breaker + Execution Engine + Fill Manager
- **Phase 8** — Reconciliation Engine (all 4 modules) + Portfolio Engine
- **Phase 9** — Scheduler (all cron jobs, all locked) + Bootstrap sequence + Entry point
- **Phase 10** — Telegram alerts + Resilience (health monitor + degradation detector) + Analytics tracker
- **Phase 11** — Dashboard: Express routes + all 9 HTML pages + CSS theme + JS (app.js, realtime.js, charts.js)
- **Phase 12** — Backtesting engine (runner, simulator, metrics)
- **Phase 13** — Demo mode full implementation + three-phase onboarding logic
- **Phase 14** — VPS deployment: PM2 config, Redis setup, SSH tunnel guide, Nginx + HTTPS optional

---

---

# ARCHITECTURE REFERENCE

---

## Project Overview

A Node.js autonomous trading bot for Polymarket prediction markets. It monitors live markets, evaluates opportunities using configurable strategies, and places/manages trades via the Polymarket CLOB API. It includes a full web admin dashboard with dual sidebars, a three-phase onboarding system (demo → micro live → full live), and institutional-grade infrastructure: event bus, state machine, distributed locking, reconciliation engine, portfolio engine, circuit breakers, backtesting, and audit trail.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js 20+ (ESM) | |
| Language | TypeScript (strict) | |
| Scheduler | node-cron | Cron jobs |
| HTTP Client | axios | API calls with retry wrapper |
| Wallet / Web3 | ethers.js v6 | Wallet signing, on-chain reads |
| Database | Supabase (Postgres) | All persistent data, real-time, auth |
| Supabase Client | @supabase/supabase-js | Bot (service role) + dashboard (anon) |
| Distributed Locking | Redis + ioredis + redlock | Prevents duplicate trades/race conditions |
| Event Bus | Node.js EventEmitter (typed) | Internal decoupled communication |
| Logging | winston | Console + Supabase transport |
| Notifications | Telegram Bot API | 4-tier alert system |
| Testing | Jest | Unit tests for math, strategy, risk |
| Process Manager | PM2 | VPS process management |
| Secrets (Phase 3) | Doppler | Replaces .env for live capital |
| Dashboard Server | Express.js | Wallet + bot control routes only |
| Dashboard UI | Bootstrap 5 (CDN) + Vanilla JS | Dual-sidebar layout |
| Real-time UI | Supabase Realtime | Live feed, no Socket.io needed |
| Charts | Chart.js | All analytics charts |
| Dashboard Auth | Supabase Auth | Email/password, JWT sessions |

---

## Final Directory Structure

```
predikt/
├── src/
│   │
│   ├── config/
│   │   └── index.ts                  # Env var loader + validator. Fails loudly if missing vars.
│   │                                 # getSettings() reads live Supabase settings table.
│   │
│   ├── core/
│   │   ├── state-machine.ts          # Bot state engine. Controls ALL execution flow.
│   │   └── bootstrap.ts              # Startup sequence: boot → sync → ready
│   │
│   ├── events/
│   │   ├── event-bus.ts              # Typed EventEmitter singleton
│   │   ├── event-types.ts            # All event name constants + payload types
│   │   └── event-handlers.ts         # Wires events to Telegram, audit, analytics
│   │
│   ├── locks/
│   │   └── index.ts                  # Redis + Redlock. acquireLock / releaseLock / withLock()
│   │
│   ├── api/
│   │   ├── polymarket.ts             # Polymarket REST API wrapper (market data)
│   │   └── clob.ts                   # CLOB order placement, cancellation, status
│   │
│   ├── wallet/
│   │   └── signer.ts                 # Ethers.js wallet. Signs orders. Reads balances.
│   │
│   ├── db/
│   │   ├── supabase.ts               # Supabase client singleton (service role)
│   │   └── queries.ts                # Typed helpers for all tables
│   │
│   ├── market-scanner/
│   │   └── scanner.ts                # Fetches + normalises market data. Emits MARKET_UPDATED.
│   │
│   ├── strategy/
│   │   ├── base.ts                   # Abstract BaseStrategy. Returns TradeIntent[] ONLY.
│   │   ├── sandbox.ts                # StrategyContext (read-only). Enforces isolation.
│   │   ├── value-bet.ts              # Default strategy: EV + Kelly sizing
│   │   └── filters.ts                # Market filters: liquidity, volume, expiry, blacklist
│   │
│   ├── risk/
│   │   ├── engine.ts                 # Central gate. Validates every TradeIntent before execution.
│   │   └── circuit-breaker.ts        # Tracks API/RPC failures. Opens breaker, pauses bot.
│   │
│   ├── execution/
│   │   ├── engine.ts                 # Takes approved TradeIntent. Acquires lock. Places order.
│   │   └── fill-manager.ts           # Tracks partial fills. Aggregates fill events.
│   │
│   ├── reconciliation/
│   │   ├── orders.ts                 # Syncs open orders: DB state vs CLOB reality
│   │   ├── balances.ts               # Syncs USDC balance: DB vs chain
│   │   ├── fills.ts                  # Detects and records partial fills
│   │   ├── positions.ts              # Resolves completed positions. Handles disputes.
│   │   └── market-state.ts           # Checks for disputed/invalidated market resolutions
│   │
│   ├── portfolio/
│   │   ├── engine.ts                 # Position lifecycle. Exposure. Drawdown. PnL.
│   │   └── snapshot.ts               # Daily PnL snapshot writer (midnight cron)
│   │
│   ├── resilience/
│   │   ├── health-monitor.ts         # Periodic health checks: API, RPC, Supabase, Redis
│   │   └── degradation-detector.ts   # Detects latency spikes, rate limits, connectivity loss
│   │
│   ├── backtesting/
│   │   ├── runner.ts                 # Replays historical snapshots through any strategy
│   │   ├── simulator.ts              # Simulates fills from order book snapshots
│   │   └── metrics.ts                # Sharpe ratio, drawdown, win rate, EV calibration
│   │
│   ├── analytics/
│   │   └── tracker.ts                # Internal performance tracking
│   │
│   ├── scheduler/
│   │   └── jobs.ts                   # All cron job definitions. All wrapped with lock + state check.
│   │
│   ├── utils/
│   │   ├── logger.ts                 # Winston logger (console + Supabase bot_logs)
│   │   ├── telegram.ts               # 4-tier alert system (INFO/WARNING/CRITICAL/FATAL)
│   │   ├── audit.ts                  # Immutable audit trail writer
│   │   ├── retry.ts                  # Exponential backoff. Detects 429s. Respects Retry-After.
│   │   └── math.ts                   # Kelly criterion, EV, Sharpe, drawdown (pure functions)
│   │
│   ├── dashboard/
│   │   ├── server.ts                 # Express setup. Auth middleware. Mounts routes.
│   │   ├── routes/
│   │   │   ├── api.ts                # Server-only routes (wallet, bot controls, log download)
│   │   │   └── pages.ts              # Serves HTML files
│   │   └── public/
│   │       ├── favicon.svg           # 16×16 favicon
│   │       ├── logo.svg              # 32×32 sidebar icon
│   │       ├── login.html
│   │       ├── index.html
│   │       ├── trades.html
│   │       ├── markets.html
│   │       ├── analytics.html
│   │       ├── backtesting.html
│   │       ├── settings.html
│   │       ├── logs.html
│   │       ├── wallet.html
│   │       ├── css/
│   │       │   └── theme.css
│   │       └── js/
│   │           ├── app.js
│   │           ├── realtime.js
│   │           └── charts.js
│   │
│   └── index.ts                      # Entry point. Runs bootstrap → scheduler → dashboard.
│
├── data/
├── logs/
├── CLAUDE.md                         # ← you are here
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

---

## Environment Variables (`.env`)

```env
# Wallet
PRIVATE_KEY=0xYOUR_PRIVATE_KEY

# Polymarket
POLYMARKET_API_BASE=https://clob.polymarket.com
POLYMARKET_API_KEY=your_l2_api_key
POLYMARKET_PROXY_ADDRESS=0xYOUR_PROXY_WALLET

# Chain
RPC_URL=https://polygon-rpc.com
CHAIN_ID=137

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Redis
REDIS_URL=redis://localhost:6379
LOCK_TTL_MS=30000

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Dashboard
DASHBOARD_PORT=3003

# Logging
LOG_LEVEL=info
```

---

## Supabase Schema (run in SQL Editor — full schema)

```sql
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
  side TEXT NOT NULL,
  price NUMERIC NOT NULL,
  size NUMERIC NOT NULL,
  size_filled NUMERIC DEFAULT 0,
  size_remaining NUMERIC,
  avg_fill_price NUMERIC,
  true_prob NUMERIC,
  ev NUMERIC,
  kelly_size NUMERIC,
  status TEXT DEFAULT 'open',
  position_state TEXT DEFAULT 'OPENING',
  outcome TEXT,
  pnl NUMERIC,
  resolution_status TEXT DEFAULT 'pending',
  resolution_source TEXT,
  dispute_notes TEXT,
  strategy_name TEXT,
  regime TEXT,
  mode TEXT DEFAULT 'demo',
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
  fill_type TEXT DEFAULT 'partial',
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
  ('MODE',                        'demo'),
  ('DEMO_STARTING_BALANCE',       '500'),
  ('DEMO_CURRENT_BALANCE',        '500'),
  ('MAX_BET_USD',                 '10'),
  ('MAX_BET_PERCENT',             '5'),
  ('AUTO_SCALE_BETS',             'false'),
  ('MIN_EDGE_PERCENT',            '5'),
  ('KELLY_FRACTION',              '0.25'),
  ('MAX_OPEN_POSITIONS',          '5'),
  ('CRON_SCHEDULE',               '*/5 * * * *'),
  ('DRY_RUN',                     'true'),
  ('DAILY_LOSS_LIMIT_USD',        '50'),
  ('MAX_SLIPPAGE_PERCENT',        '2'),
  ('MIN_LIQUIDITY_MULTIPLIER',    '3'),
  ('AUTO_PAUSE_WIN_RATE_THRESHOLD','40'),
  ('AUTO_PAUSE_LOOKBACK_TRADES',  '20'),
  ('MIN_MATIC_BALANCE',           '0.5'),
  ('TELEGRAM_NOTIFICATIONS',      'false'),
  ('STRATEGY',                    'value-bet')
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
  resolution TEXT,
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

CREATE POLICY "read_markets"           ON markets              FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage_blacklist"       ON blacklisted_markets  FOR ALL    TO authenticated USING (true);
CREATE POLICY "read_trades"            ON trades               FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_fills"             ON fills                FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_pnl"               ON pnl_snapshots        FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_demo_trades"       ON demo_trades          FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_demo_balance"      ON demo_balance_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_settings"          ON settings             FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_settings"         ON settings             FOR UPDATE TO authenticated USING (true);
CREATE POLICY "read_settings_history"  ON settings_history     FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_bot_status"        ON bot_status           FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_logs"              ON bot_logs             FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_audit"             ON audit_logs           FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_snapshots"         ON market_snapshots     FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage_backtests"       ON backtest_runs        FOR ALL    TO authenticated USING (true);
CREATE POLICY "manage_onboarding"      ON onboarding           FOR ALL    TO authenticated USING (true);
-- Service role (bot) bypasses RLS automatically
```

---

## Event System (`src/events/`)

### `event-types.ts` — All Events

```ts
export const EVENTS = {
  MARKET_UPDATED:       'market.updated',
  SIGNAL_GENERATED:     'signal.generated',
  TRADE_REQUESTED:      'trade.requested',
  TRADE_APPROVED:       'trade.approved',
  TRADE_REJECTED:       'trade.rejected',
  ORDER_SUBMITTED:      'order.submitted',
  ORDER_FILLED:         'order.filled',
  ORDER_PARTIAL_FILL:   'order.partial_fill',
  ORDER_FAILED:         'order.failed',
  ORDER_CANCELLED:      'order.cancelled',
  POSITION_OPENED:      'position.opened',
  POSITION_CLOSED:      'position.closed',
  POSITION_DISPUTED:    'position.disputed',
  POSITION_INVALIDATED: 'position.invalidated',
  RISK_LIMIT_HIT:       'risk.limit_hit',
  DAILY_LOSS_HIT:       'risk.daily_loss_hit',
  BOT_PAUSED:           'bot.paused',
  BOT_RESUMED:          'bot.resumed',
  EMERGENCY_STOPPED:    'bot.emergency_stopped',
  STATE_CHANGED:        'bot.state_changed',
  PHASE_TRANSITION:     'bot.phase_transition',
  CIRCUIT_BREAKER_OPEN:   'circuit_breaker.opened',
  CIRCUIT_BREAKER_CLOSED: 'circuit_breaker.closed',
  WALLET_LOW_BALANCE:     'wallet.low_balance',
  WALLET_LOW_MATIC:       'wallet.low_matic',
  DAILY_SNAPSHOT:       'daily.snapshot',
  RECONCILE_COMPLETE:   'reconcile.complete',
} as const;
```

---

## State Machine (`src/core/state-machine.ts`)

```
BOOTING → SYNCING → READY ⇄ SCANNING → PLACING_ORDER → WAITING_CONFIRMATION
                      ↕                      ↓
                    PAUSED           ERROR_RECOVERY
                      ↕                      ↓
               EMERGENCY_STOPPED ←──────────────
                      ↓
                  SHUTTING_DOWN
```

Every module checks `stateMachine.canScan()` or `stateMachine.canTrade()` before executing. Invalid transitions throw — they never silently pass.

---

## Execution Pipeline (full flow per scan cycle)

```
1. Cron fires → acquireLock('scan:lock') → check stateMachine.canScan()
2. stateMachine.transition('SCANNING')
3. Market Scanner
   - fetches markets from Polymarket API
   - filters: blacklist, volume, liquidity, expiry
   - detects market regime
   - stores market_snapshots row (for backtesting)
   - emits MARKET_UPDATED
4. Signal Engine (Strategy Sandbox)
   - passes StrategyContext (read-only) to active strategy
   - strategy returns TradeIntent[] ONLY — no side effects
   - emits SIGNAL_GENERATED per intent
5. Risk Engine (for each intent)
   - checks: daily loss limit, max open positions, min edge, max bet,
             circuit breakers open, balance sufficient, not blacklisted,
             order book depth ≥ size × MIN_LIQUIDITY_MULTIPLIER,
             stateMachine.canTrade()
   - approved → emits TRADE_APPROVED
   - blocked  → emits TRADE_REJECTED + audit log
6. Execution Engine (for each approved intent)
   - acquireLock('trade:lock:{marketId}')
   - stateMachine.transition('PLACING_ORDER')
   - MODE = demo: write demo_trades row, decrement demo balance, done
   - MODE = live + DRY_RUN=true: log only, no order
   - MODE = live + DRY_RUN=false: sign order with ethers.js, POST to CLOB
   - stateMachine.transition('WAITING_CONFIRMATION')
   - on success: write trades row, emit ORDER_SUBMITTED
   - on failure: emit ORDER_FAILED, stateMachine.transition('ERROR_RECOVERY')
7. stateMachine.transition('READY')
8. releaseLock('scan:lock')
```

---

## Distributed Locking (`src/locks/index.ts`)

```ts
// Named locks used in the system:
// 'scan'              — main strategy cycle (prevents cron overlap)
// 'trade:{marketId}'  — per-market order placement (prevents duplicate orders)
// 'reconcile:orders'  — order reconciliation job
// 'reconcile:fills'   — fill reconciliation job
// 'reconcile:balances'— balance sync
// 'position:sync'     — position lifecycle updates
```

---

## Reconciliation Cron Schedule

```ts
cron.schedule('*/2 * * * *',   () => withLock('reconcile:orders',   30000, reconcileOpenOrders));
cron.schedule('*/5 * * * *',   () => withLock('reconcile:fills',    30000, reconcileFills));
cron.schedule('*/5 * * * *',   () => withLock('reconcile:balances', 30000, reconcileBalances));
cron.schedule('0 * * * *',     () => withLock('position:sync',      60000, reconcilePositions));
cron.schedule('*/10 * * * * *',() => upsertBotStatus());
cron.schedule('0 0 * * *',     () => withLock('snapshot', 60000, writeDailySnapshot));
```

---

## Portfolio Engine (`src/portfolio/engine.ts`)

```ts
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
// If totalExposure / totalBalance > 0.8 → risk engine blocks all new trades
```

---

## Risk Engine (`src/risk/engine.ts`)

The single gate all trade intents must pass through. Checks in order:
1. Circuit breakers
2. State machine (`canTrade()`)
3. Daily loss limit
4. Max open positions
5. Sufficient balance
6. Minimum edge %
7. Order book liquidity depth
8. Blacklist
9. Win rate auto-pause

---

## Circuit Breaker (`src/risk/circuit-breaker.ts`)

```ts
const BREAKERS = {
  polymarket_api: { threshold: 5, windowMs: 60_000, cooldownMs: 300_000 },
  polygon_rpc:    { threshold: 3, windowMs: 30_000, cooldownMs: 120_000 },
  supabase:       { threshold: 5, windowMs: 60_000, cooldownMs:  60_000 },
};
// State: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)
```

---

## Strategy Sandboxing (`src/strategy/sandbox.ts`)

```ts
export interface StrategyContext {
  readonly markets: MarketSnapshot[];
  readonly orderBooks: Record<string, OrderBook>;
  readonly currentBalance: number;
  readonly openPositions: Position[];
  readonly settings: BotSettings;
  readonly regime: MarketRegime;
  readonly mode: 'demo' | 'live';
}

export interface TradeIntent {
  marketId: string;
  marketQuestion: string;
  side: 'YES' | 'NO';
  suggestedPrice: number;
  suggestedSize: number;
  trueProb: number;
  ev: number;
  kellySize: number;
  strategyName: string;
  reasoning: string;
}
```

---

## Market Regime Classification

```ts
export type MarketRegime =
  | 'NORMAL'
  | 'HIGH_VOLATILITY'    // avg spread > 8%
  | 'LOW_LIQUIDITY'      // avg liquidity < $5,000
  | 'NEWS_SPIKE'         // sudden volume spike detected
  | 'PRE_RESOLUTION'     // >30% of markets resolving in <24h
  | 'ELECTION_PERIOD';   // >50% of markets are political category
```

---

## Telegram Alert System (`src/utils/telegram.ts`)

```ts
export type AlertLevel = 'INFO' | 'WARNING' | 'CRITICAL' | 'FATAL';

const LEVEL_CONFIG = {
  INFO:     { emoji: 'ℹ️',  autoPause: false },
  WARNING:  { emoji: '⚠️',  autoPause: false },
  CRITICAL: { emoji: '🔴',  autoPause: true  },
  FATAL:    { emoji: '💀',  autoPause: true  },
};
```

---

## Demo Mode

- Bot reads real Polymarket data (real prices, real order books)
- Never calls CLOB — writes to `demo_trades` instead
- Virtual balance tracked in `settings` table (`DEMO_CURRENT_BALANCE`)
- Hourly cron resolves demo trades when real markets settle

---

## Three-Phase Onboarding

| Phase | Capital | Duration | Unlocks when |
|---|---|---|---|
| 1 — Demo | $0 virtual | Min 7 days | 10+ demo trades AND win rate ≥ 50% |
| 2 — Micro Live | $10 real USDC | Until 20 real trades | 20 real trades AND live win rate ≥ 45% |
| 3 — Full Live | Your capital | Ongoing | Auto — scale gradually |

---

## Dashboard — Dual Sidebar Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  LEFT (240px fixed)      │  MAIN CONTENT            │  RIGHT (280px)   │
│                          │                          │                  │
│  Logo — Predikt          │  Page content            │  ● LIVE NOW      │
│  ──────────────          │                          │  $248.50 USDC    │
│  HOME                    │                          │  3/5 positions   │
│  ● Overview    [active]  │                          │  Next scan: 3:12 │
│  ● Analytics             │                          │  Regime: NORMAL  │
│  ● Markets               │                          │  ──────────────  │
│                          │                          │  ACTIVITY ALERTS │
│  BOT CONTROLS            │                          │  ──────────────  │
│  ● Trades                │                          │  [live feed via  │
│  ● Backtesting           │                          │   Supabase       │
│  ● Settings              │                          │   Realtime]      │
│  ● Logs                  │                          │                  │
│  ● Wallet                │                          │                  │
│  ──────────────          │                          │                  │
│  ● RUNNING  [DRY RUN]    │                          │                  │
│  USDC: $248.50           │                          │                  │
└──────────────────────────┴──────────────────────────┴──────────────────┘
```

### Dashboard Pages (9 total)

| # | File | Purpose |
|---|---|---|
| — | `login.html` | Supabase Auth login |
| 1 | `index.html` | Overview: stat cards, bot controls, onboarding checklist |
| 2 | `trades.html` | Full trade log: filterable, paginated, exportable |
| 3 | `markets.html` | Opportunities tab + All scanned tab |
| 4 | `analytics.html` | 6 Chart.js charts. DEMO/LIVE tab |
| 5 | `backtesting.html` | Run backtests. Equity curve. Compare runs |
| 6 | `settings.html` | All settings. Quick-start presets. Settings history |
| 7 | `logs.html` | Live log stream tab + Audit log tab |
| 8 | `wallet.html` | Balances, approve USDC, withdraw |

### Express Routes (server-side only)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/wallet` | USDC + MATIC balances |
| POST | `/api/wallet/approve` | Execute USDC approval on-chain |
| POST | `/api/wallet/withdraw` | Send USDC to target address |
| POST | `/api/bot/scan` | Trigger immediate scan |
| POST | `/api/bot/pause` | Pause scheduler |
| POST | `/api/bot/resume` | Resume scheduler |
| POST | `/api/bot/emergency-stop` | Stop + cancel all orders |
| POST | `/api/backtest/run` | Run backtest |
| GET | `/api/logs/download` | Stream log file |

---

## CSS Theme Variables

```css
--bg-primary: #000000;
--bg-secondary: #111010;
--bg-card: #171616;
--bg-sidebar: #111010;
--accent-primary: #ff0024;
--accent-hover: #c90622;
--accent-success: #1ed760;
--accent-danger: #ff4444;
--text-primary: #fff;
--text-secondary: #b3b3b3;
--text-muted: #666;
--border-primary: #282828;
--font-family: "Rubik", system-ui, sans-serif;
--sidebar-left-width: 240px;
--sidebar-right-width: 280px;
```

---

## Capital Sizing Presets

| Preset | Balance | MAX_BET | MIN_EDGE | KELLY | MAX_POS | DAILY_LOSS |
|---|---|---|---|---|---|---|
| Micro | $10–$50 | $1 | 10% | 0.20 | 2 | $3 |
| Starter | $50–$200 | $5 | 7% | 0.25 | 4 | $15 |
| Standard | $200+ | $10 | 5% | 0.25 | 5 | $50 |

---

## The Most Important Non-Technical Rule

The architecture is institutional-grade. The code will not be the problem.

The real problem will be **edge quality** — whether the bot's estimated true probability is actually better than the market price. Most bots fail because they automate bad assumptions very efficiently.

Run demo for at least 7 real days. Take the Phase 2 micro test seriously. Let the data tell you when to scale, not excitement.
