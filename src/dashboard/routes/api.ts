import { Router, type RequestHandler } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { signer } from '../../wallet/signer.js';
import { clobClient } from '../../api/clob.js';
import { stateMachine } from '../../core/state-machine.js';
import { triggerImmediateScan } from '../../scheduler/jobs.js';
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
    supabaseUrl: config.SUPABASE_URL,
    supabaseAnonKey: config.SUPABASE_ANON_KEY,
    version: '1.0.0',
  });
});

apiRouter.get('/status', async (_req, res) => {
  try {
    const { data } = await supabase.from('bot_status').select('*').eq('id', 1).single();
    res.json(data ?? {});
  } catch {
    res.json({ state: stateMachine.state });
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
  try {
    stateMachine.transition('PAUSED');
    logger.info('Bot paused via dashboard');
    res.json({ success: true, state: 'PAUSED' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

apiRouter.post('/bot/resume', requireAuth, (_req, res) => {
  try {
    stateMachine.transition('READY');
    logger.info('Bot resumed via dashboard');
    res.json({ success: true, state: 'READY' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

apiRouter.post('/bot/emergency-stop', requireAuth, async (_req, res) => {
  try {
    stateMachine.transition('EMERGENCY_STOPPED');
    await clobClient.cancelAllOrders();
    logger.error('Emergency stop triggered via dashboard');
    res.json({ success: true, state: 'EMERGENCY_STOPPED' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.post('/backtest/run', requireAuth, (_req, res) => {
  // Implemented in Phase 12
  res.status(501).json({ error: 'Backtesting engine not yet implemented (Phase 12)' });
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
