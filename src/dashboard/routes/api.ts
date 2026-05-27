import { Router, type RequestHandler } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { signer } from '../../wallet/signer.js';
import { clobClient } from '../../api/clob.js';
import { stateMachine } from '../../core/state-machine.js';
import { triggerImmediateScan } from '../../scheduler/jobs.js';
import { runBacktest } from '../../backtesting/runner.js';
import { getChecklistState } from '../../onboarding/manager.js';
import { supabase } from '../../db/supabase.js';

export const apiRouter = Router();

// ─── Auth client (anon key — for JWT verification only) ───────────────────────

const authClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

const requireAuth: RequestHandler = async (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const { data: { user }, error } = await authClient.auth.getUser(token);
    if (error ?? !user) throw new Error('Invalid token');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ─── Public endpoints ─────────────────────────────────────────────────────────

// Browser needs Supabase creds to init the client. Anon key is safe to expose.
apiRouter.get('/config', (_req, res) => {
  res.json({
    supabaseUrl:      config.SUPABASE_URL,
    supabaseAnonKey:  config.SUPABASE_ANON_KEY,
    appUrl:           config.APP_URL,
    version:          '1.0.0',
  });
});

// ─── /api/me — returns current user's role ────────────────────────────────────

const _anonClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

apiRouter.get('/me', async (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const { data: { user }, error } = await _anonClient.auth.getUser(token);
    if (error ?? !user) { res.status(401).json({ error: 'Invalid token' }); return; }

    const isAdmin = user.email === config.ADMIN_EMAIL;

    // Fetch display_name from user_profiles
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name, role, telegram_id, telegram_username')
      .eq('id', user.id)
      .maybeSingle();

    res.json({
      id:          user.id,
      email:       user.email,
      displayName: profile?.display_name ?? user.email?.split('@')[0] ?? 'User',
      role:        isAdmin ? 'admin' : (profile?.role ?? 'user'),
      isAdmin,
      telegramUsername: profile?.telegram_username ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.get('/status', async (_req, res) => {
  try {
    const { data } = await supabase.from('bot_status').select('*').eq('id', 1).single();
    res.json(data ?? {});
  } catch {
    res.json({ state: stateMachine.state });
  }
});

apiRouter.get('/onboarding/checklist', async (_req, res) => {
  try {
    const state = await getChecklistState();
    res.json(state ?? { phase: 1, items: [], canAdvance: false });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Authenticated endpoints ──────────────────────────────────────────────────

apiRouter.get('/wallet', requireAuth, async (_req, res) => {
  try {
    if (!config.PRIVATE_KEY) {
      res.json({ usdc: 0, matic: 0, address: null, mode: 'demo' });
      return;
    }
    const [usdc, matic] = await Promise.all([signer.getUsdcBalance(), signer.getMaticBalance()]);
    res.json({ usdc, matic, address: signer.getAddress(), mode: 'live' });
  } catch (err) {
    logger.error('Wallet balance fetch failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch wallet balances' });
  }
});

apiRouter.post('/wallet/approve', requireAuth, async (req, res) => {
  try {
    if (!config.PRIVATE_KEY) {
      res.status(400).json({ error: 'Wallet not configured (demo mode)' });
      return;
    }
    const amount = parseFloat(String(req.body['amount'] ?? '100'));
    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
    }
    const txHash = await signer.approveUsdc(amount);
    logger.info('USDC approval via dashboard', { amount, txHash });
    res.json({ success: true, txHash });
  } catch (err) {
    logger.error('USDC approval failed', { error: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.post('/wallet/withdraw', requireAuth, async (req, res) => {
  try {
    if (!config.PRIVATE_KEY) {
      res.status(400).json({ error: 'Wallet not configured (demo mode)' });
      return;
    }
    const { to, amount } = req.body as { to?: string; amount?: number };
    if (!to || !amount || amount <= 0) {
      res.status(400).json({ error: 'Invalid to address or amount' });
      return;
    }
    const txHash = await signer.transferUsdc(to, amount);
    logger.info('USDC withdrawal via dashboard', { to, amount, txHash });
    res.json({ success: true, txHash });
  } catch (err) {
    logger.error('USDC withdrawal failed', { error: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.post('/bot/scan', requireAuth, (_req, res) => {
  try {
    triggerImmediateScan();
    res.json({ success: true, message: 'Scan triggered' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.post('/bot/pause', requireAuth, (_req, res) => {
  if (stateMachine.state === 'PAUSED') {
    res.json({ success: true, state: 'PAUSED' }); return;
  }
  try {
    stateMachine.transition('PAUSED');
    logger.info('Bot paused via dashboard');
    res.json({ success: true, state: 'PAUSED' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

apiRouter.post('/bot/resume', requireAuth, (_req, res) => {
  if (stateMachine.state === 'READY') {
    res.json({ success: true, state: 'READY' }); return;
  }
  try {
    stateMachine.transition('READY');
    logger.info('Bot resumed via dashboard');
    res.json({ success: true, state: 'READY' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

apiRouter.post('/bot/emergency-stop', requireAuth, async (_req, res) => {
  if (stateMachine.state === 'EMERGENCY_STOPPED') {
    res.json({ success: true, state: 'EMERGENCY_STOPPED' }); return;
  }
  try {
    stateMachine.transition('EMERGENCY_STOPPED');
    await clobClient.cancelAllOrders();
    logger.error('Emergency stop triggered via dashboard');
    res.json({ success: true, state: 'EMERGENCY_STOPPED' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.post('/bot/recover', requireAuth, (_req, res) => {
  if (stateMachine.state !== 'EMERGENCY_STOPPED') {
    res.json({ success: false, error: `Not in EMERGENCY_STOPPED — state is ${stateMachine.state}` }); return;
  }
  try {
    stateMachine.transition('READY');
    logger.info('Bot recovered from EMERGENCY_STOPPED via dashboard');
    res.json({ success: true, state: 'READY' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

apiRouter.post('/backtest/run', requireAuth, async (req, res) => {
  try {
    const body = req.body as {
      strategy?: string;
      dateFrom?: string;
      dateTo?: string;
      startingBalance?: number;
      minEdge?: number;
      maxBetUsd?: number;
      kellyFraction?: number;
    };

    const dateFrom = body.dateFrom ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dateTo   = body.dateTo   ?? new Date().toISOString().slice(0, 10);
    const startingBalance = Number(body.startingBalance ?? 500);
    const minEdge  = Number(body.minEdge ?? 5);
    const maxBetUsd = Number(body.maxBetUsd ?? 10);
    const kellyFraction = Number(body.kellyFraction ?? 0.25);

    if (startingBalance <= 0 || minEdge <= 0) {
      res.status(400).json({ error: 'Invalid configuration parameters' });
      return;
    }

    const result = await runBacktest({
      strategyName:    body.strategy ?? 'value-bet',
      dateFrom,
      dateTo,
      startingBalance,
      minEdgePercent:  minEdge,
      maxBetUsd,
      kellyFraction,
    });

    res.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    logger.error('Backtest run failed', { error: msg });
    res.status(500).json({ error: msg });
  }
});

apiRouter.get('/logs/download', requireAuth, async (_req, res) => {
  try {
    const { data } = await supabase
      .from('bot_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="predikt-logs-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
