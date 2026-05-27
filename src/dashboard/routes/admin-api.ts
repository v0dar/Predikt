import { Router, type RequestHandler } from 'express';
import axios from 'axios';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { supabase } from '../../db/supabase.js';
import { stateMachine } from '../../core/state-machine.js';
import { clobClient } from '../../api/clob.js';
import { signer } from '../../wallet/signer.js';
import { triggerImmediateScan } from '../../scheduler/jobs.js';
import { pingRedis } from '../../locks/index.js';

export const adminApiRouter = Router();

// ─── Internal secret auth ─────────────────────────────────────────────────────
// Only the Telegram bot (same server) calls these endpoints.
// It sets X-Internal-Secret: <TELEGRAM_ADMIN_SECRET>.

const requireInternalAuth: RequestHandler = (req, res, next) => {
  const secret = req.headers['x-internal-secret'];
  if (!config.TELEGRAM_ADMIN_SECRET || secret !== config.TELEGRAM_ADMIN_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

adminApiRouter.use(requireInternalAuth);

// ─── GET /api/admin/status ────────────────────────────────────────────────────

adminApiRouter.get('/status', async (_req, res) => {
  try {
    const { data } = await supabase.from('bot_status').select('*').eq('id', 1).single();
    res.json(data ?? { state: stateMachine.state });
  } catch {
    res.json({ state: stateMachine.state });
  }
});

// ─── GET /api/admin/health ────────────────────────────────────────────────────

adminApiRouter.get('/health', async (_req, res) => {
  const start = Date.now();
  const checks = { supabase: 'error' as 'ok' | 'error', redis: 'error' as 'ok' | 'error', stateMachine: stateMachine.state, uptime: process.uptime() };

  // Supabase check
  try {
    await supabase.from('bot_status').select('id').eq('id', 1).single();
    checks.supabase = 'ok';
  } catch {}

  // Redis check
  if (await pingRedis()) checks.redis = 'ok';

  const degraded = checks.supabase === 'error' || checks.redis === 'error';
  const status   = degraded ? 'degraded' : 'ok';

  logger.debug('Health check', { status, durationMs: Date.now() - start });
  res.json({ status, checks, timestamp: new Date().toISOString() });
});

// ─── GET /api/admin/diagnose ──────────────────────────────────────────────────
// Tests all four Polymarket config layers independently.

adminApiRouter.get('/diagnose', async (_req, res) => {
  const result: Record<string, unknown> = {};

  // 1. Private key → wallet address
  try {
    result.wallet_address = signer.getAddress();
    result.private_key    = 'ok';
  } catch (err) {
    result.private_key    = `error: ${(err as Error).message}`;
    result.wallet_address = null;
  }

  // 2. RPC → on-chain balances
  try {
    const [usdc, matic] = await Promise.all([
      signer.getUsdcBalance(),
      signer.getMaticBalance(),
    ]);
    result.rpc      = 'ok';
    result.usdc     = usdc;
    result.matic    = matic;
  } catch (err) {
    result.rpc  = `error: ${(err as Error).message}`;
    result.usdc = null;
    result.matic = null;
  }

  // 3. Proxy address (from env — not validated on-chain)
  result.proxy_address = config.POLYMARKET_PROXY_ADDRESS ?? null;
  result.proxy_set     = !!config.POLYMARKET_PROXY_ADDRESS;

  // 4. CLOB API connectivity (public endpoint — no auth needed)
  try {
    const resp = await axios.get(`${config.POLYMARKET_API_BASE}/ok`, { timeout: 8_000 });
    result.clob_connectivity = resp.status === 200 ? 'ok' : `http ${resp.status}`;
  } catch (err) {
    result.clob_connectivity = `error: ${(err as Error).message}`;
  }

  // 5. CLOB API key — format validation only (Polymarket has no public auth-test endpoint)
  const key = config.POLYMARKET_API_KEY ?? '';
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!key) {
    result.api_key = 'not set';
  } else if (!uuidRe.test(key)) {
    result.api_key = 'invalid format (expected UUID)';
  } else {
    result.api_key = 'configured';
  }

  logger.info('Polymarket diagnostic run', result);
  res.json(result);
});

// ─── GET /api/admin/mode ──────────────────────────────────────────────────────

adminApiRouter.get('/mode', async (_req, res) => {
  try {
    const { data: rows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['MODE', 'DRY_RUN', 'STRATEGY']);

    const map = Object.fromEntries((rows ?? []).map(r => [r.key, r.value]));

    res.json({
      mode:     map['MODE']     ?? 'demo',
      dry_run:  map['DRY_RUN']  === 'true',
      strategy: map['STRATEGY'] ?? 'value-bet',
      state:    stateMachine.state,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/admin/signals ───────────────────────────────────────────────────
// Returns the 10 most recently scanned markets from the last scan batch.

adminApiRouter.get('/signals', async (_req, res) => {
  try {
    const { data } = await supabase
      .from('market_snapshots')
      .select('market_id, market_question, yes_price, no_price, spread, volume_usd, liquidity_usd, regime, end_date, snapped_at')
      .order('snapped_at', { ascending: false })
      .limit(10);

    const signals = (data ?? []).map(s => ({
      market_id:     s.market_id,
      question:      s.market_question ?? '',
      yes_price:     s.yes_price,
      no_price:      s.no_price,
      spread:        s.spread,
      volume_usd:    s.volume_usd,
      liquidity_usd: s.liquidity_usd,
      regime:        s.regime,
      end_date:      s.end_date,
      snapped_at:    s.snapped_at,
    }));

    res.json(signals);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/admin/positions ─────────────────────────────────────────────────

adminApiRouter.get('/positions', async (_req, res) => {
  try {
    const { data } = await supabase
      .from('trades')
      .select('id, market_question, side, price, size, size_filled, status, placed_at, mode')
      .in('status', ['open', 'partial'])
      .order('placed_at', { ascending: false })
      .limit(20);

    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/admin/portfolio ─────────────────────────────────────────────────

adminApiRouter.get('/portfolio', async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: statusData }, { data: snap }, { data: openTrades }] = await Promise.all([
      supabase.from('bot_status').select('usdc_balance, open_positions, current_regime, mode').eq('id', 1).single(),
      supabase.from('pnl_snapshots').select('net_pnl, trades_placed').eq('date', today).maybeSingle(),
      supabase.from('trades').select('price, size').in('status', ['open', 'partial']),
    ]);

    const totalExposure = (openTrades ?? []).reduce((sum, t) => sum + (Number(t.price) * Number(t.size)), 0);

    res.json({
      total_balance:  statusData?.usdc_balance ?? null,
      open_positions: statusData?.open_positions ?? 0,
      total_exposure: totalExposure,
      today_pnl:      snap?.net_pnl ?? null,
      today_trades:   snap?.trades_placed ?? 0,
      mode:           statusData?.mode ?? 'demo',
      regime:         statusData?.current_regime ?? 'NORMAL',
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/admin/trades ────────────────────────────────────────────────────

adminApiRouter.get('/trades', async (_req, res) => {
  try {
    const { data } = await supabase
      .from('trades')
      .select('id, market_question, side, price, size, status, pnl, placed_at, mode')
      .order('placed_at', { ascending: false })
      .limit(10);

    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/admin/risk ──────────────────────────────────────────────────────

adminApiRouter.get('/risk', async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: statusData }, { data: snap }, { data: openTrades }, { data: settings }] = await Promise.all([
      supabase.from('bot_status').select('usdc_balance, open_positions, circuit_breakers').eq('id', 1).single(),
      supabase.from('pnl_snapshots').select('net_pnl').eq('date', today).maybeSingle(),
      supabase.from('trades').select('price, size').in('status', ['open', 'partial']),
      supabase.from('settings').select('key, value').in('key', ['MAX_OPEN_POSITIONS', 'DAILY_LOSS_LIMIT_USD', 'MAX_BET_USD', 'MIN_EDGE_PERCENT', 'DEMO_CURRENT_BALANCE', 'DEMO_STARTING_BALANCE']),
    ]);

    const map = Object.fromEntries((settings ?? []).map(s => [s.key, s.value]));
    const totalExposure  = (openTrades ?? []).reduce((sum, t) => sum + (Number(t.price) * Number(t.size)), 0);
    const balance        = Number(statusData?.usdc_balance ?? map['DEMO_CURRENT_BALANCE'] ?? 0);
    const startBal       = Number(map['DEMO_STARTING_BALANCE'] ?? balance);
    const drawdownPct    = startBal > 0 ? Math.max(0, ((startBal - balance) / startBal) * 100) : 0;

    res.json({
      daily_loss_today:     snap?.net_pnl != null && Number(snap.net_pnl) < 0 ? snap.net_pnl : 0,
      daily_loss_limit:     Number(map['DAILY_LOSS_LIMIT_USD'] ?? 50),
      open_positions:       statusData?.open_positions ?? 0,
      max_positions:        Number(map['MAX_OPEN_POSITIONS'] ?? 5),
      total_exposure:       totalExposure,
      max_bet_usd:          Number(map['MAX_BET_USD'] ?? 10),
      min_edge_percent:     Number(map['MIN_EDGE_PERCENT'] ?? 5),
      circuit_breakers:     statusData?.circuit_breakers ?? null,
      current_drawdown_pct: drawdownPct,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/admin/settings ──────────────────────────────────────────────────

adminApiRouter.get('/settings', async (_req, res) => {
  try {
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'MODE', 'DRY_RUN', 'STRATEGY',
        'MAX_BET_USD', 'MAX_BET_PERCENT', 'MIN_EDGE_PERCENT',
        'KELLY_FRACTION', 'MAX_OPEN_POSITIONS', 'DAILY_LOSS_LIMIT_USD',
        'CRON_SCHEDULE', 'AUTO_SCALE_BETS', 'MAX_SLIPPAGE_PERCENT',
        'TELEGRAM_NOTIFICATIONS',
      ]);

    const map = Object.fromEntries((data ?? []).map(r => [r.key, r.value]));
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/admin/bot/pause ────────────────────────────────────────────────

adminApiRouter.post('/bot/pause', (_req, res) => {
  try {
    if (stateMachine.state === 'PAUSED') {
      res.json({ success: true, state: 'PAUSED', message: 'Already paused' });
      return;
    }
    stateMachine.transition('PAUSED');
    logger.info('Bot paused via dashboard/Telegram');
    res.json({ success: true, state: 'PAUSED' });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// ─── POST /api/admin/bot/resume ───────────────────────────────────────────────

adminApiRouter.post('/bot/resume', (_req, res) => {
  try {
    if (stateMachine.state === 'READY') {
      res.json({ success: true, state: 'READY', message: 'Already running' });
      return;
    }
    stateMachine.transition('READY');
    logger.info('Bot resumed via dashboard/Telegram');
    res.json({ success: true, state: 'READY' });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// ─── POST /api/admin/bot/emergency-stop ──────────────────────────────────────

adminApiRouter.post('/bot/emergency-stop', async (_req, res) => {
  try {
    stateMachine.transition('EMERGENCY_STOPPED');
    await clobClient.cancelAllOrders();
    logger.error('Emergency stop triggered via Telegram');
    res.json({ success: true, state: 'EMERGENCY_STOPPED' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ─── POST /api/admin/bot/recover ─────────────────────────────────────────────
// Clears EMERGENCY_STOPPED → READY. Only valid after human review.

adminApiRouter.post('/bot/recover', (_req, res) => {
  if (stateMachine.state !== 'EMERGENCY_STOPPED') {
    res.json({ success: false, error: `Not in EMERGENCY_STOPPED — current state: ${stateMachine.state}` });
    return;
  }
  try {
    stateMachine.transition('READY');
    logger.info('Bot recovered from EMERGENCY_STOPPED via Telegram');
    res.json({ success: true, state: 'READY' });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// ─── POST /api/admin/bot/scan ─────────────────────────────────────────────────

adminApiRouter.post('/bot/scan', (_req, res) => {
  try {
    triggerImmediateScan();
    res.json({ success: true, message: 'Scan triggered' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});
