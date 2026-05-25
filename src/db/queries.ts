import { supabase } from './supabase.js';
import type {
  Trade,
  TradeStatus,
  Fill,
  DemoTrade,
  BotStatus,
  BotStatusUpdate,
  BotSettings,
  Onboarding,
  MarketSnapshot,
  PnlSnapshot,
  InsertFill,
  InsertBotLog,
  InsertAuditLog,
} from './types.js';

// ─── Internal error logger (replaced by winston in Phase 3) ──────────────────

function logError(fn: string, err: unknown): void {
  console.error(`[DB:${fn}]`, err instanceof Error ? err.message : err);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function parseSettings(rows: { key: string; value: string }[]): BotSettings {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const num = (k: string, fallback: number): number => {
    const v = parseFloat(map[k] ?? '');
    return isNaN(v) ? fallback : v;
  };
  const bool = (k: string, fallback: boolean): boolean => {
    const v = map[k];
    if (v === undefined) return fallback;
    return v === 'true';
  };
  const str = (k: string, fallback: string): string => map[k] ?? fallback;

  return {
    MODE: (str('MODE', 'demo') as BotSettings['MODE']),
    DEMO_STARTING_BALANCE: num('DEMO_STARTING_BALANCE', 500),
    DEMO_CURRENT_BALANCE: num('DEMO_CURRENT_BALANCE', 500),
    MAX_BET_USD: num('MAX_BET_USD', 10),
    MAX_BET_PERCENT: num('MAX_BET_PERCENT', 5),
    AUTO_SCALE_BETS: bool('AUTO_SCALE_BETS', false),
    MIN_EDGE_PERCENT: num('MIN_EDGE_PERCENT', 5),
    KELLY_FRACTION: num('KELLY_FRACTION', 0.25),
    MAX_OPEN_POSITIONS: num('MAX_OPEN_POSITIONS', 5),
    CRON_SCHEDULE: str('CRON_SCHEDULE', '*/5 * * * *'),
    DRY_RUN: bool('DRY_RUN', true),
    DAILY_LOSS_LIMIT_USD: num('DAILY_LOSS_LIMIT_USD', 50),
    MAX_SLIPPAGE_PERCENT: num('MAX_SLIPPAGE_PERCENT', 2),
    MIN_LIQUIDITY_MULTIPLIER: num('MIN_LIQUIDITY_MULTIPLIER', 3),
    AUTO_PAUSE_WIN_RATE_THRESHOLD: num('AUTO_PAUSE_WIN_RATE_THRESHOLD', 40),
    AUTO_PAUSE_LOOKBACK_TRADES: num('AUTO_PAUSE_LOOKBACK_TRADES', 20),
    MIN_MATIC_BALANCE: num('MIN_MATIC_BALANCE', 0.5),
    TELEGRAM_NOTIFICATIONS: bool('TELEGRAM_NOTIFICATIONS', false),
    STRATEGY: str('STRATEGY', 'value-bet'),
  };
}

export async function getAllSettings(): Promise<BotSettings> {
  try {
    const { data, error } = await supabase.from('settings').select('key, value');
    if (error) throw error;
    return parseSettings(data ?? []);
  } catch (err) {
    logError('getAllSettings', err);
    return parseSettings([]);
  }
}

export async function getSetting(key: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .single();
    if (error) throw error;
    return (data as { value: string } | null)?.value ?? null;
  } catch (err) {
    logError('getSetting', err);
    return null;
  }
}

export async function upsertSetting(key: string, value: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
  } catch (err) {
    logError('upsertSetting', err);
  }
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export async function insertTrade(trade: {
  market_id: string;
  market_question: string;
  order_id?: string | null;
  side: 'YES' | 'NO';
  price: number;
  size: number;
  true_prob?: number | null;
  ev?: number | null;
  kelly_size?: number | null;
  strategy_name?: string | null;
  regime?: string | null;
  mode: 'demo' | 'live';
}): Promise<Trade | null> {
  try {
    const row = {
      ...trade,
      size_remaining: trade.size,
      status: 'open' as const,
      position_state: 'OPENING' as const,
    };
    const { data, error } = await supabase.from('trades').insert(row).select().single();
    if (error) throw error;
    return data as Trade;
  } catch (err) {
    logError('insertTrade', err);
    return null;
  }
}

export async function insertDemoTrade(trade: {
  market_id: string;
  market_question: string;
  side: 'YES' | 'NO';
  price: number;
  size: number;
  true_prob?: number | null;
  ev?: number | null;
  kelly_size?: number | null;
  strategy_name?: string | null;
  regime?: string | null;
}): Promise<DemoTrade | null> {
  try {
    const { data, error } = await supabase
      .from('demo_trades')
      .insert({ ...trade, status: 'open' })
      .select()
      .single();
    if (error) throw error;
    return data as DemoTrade;
  } catch (err) {
    logError('insertDemoTrade', err);
    return null;
  }
}

export async function getOpenPositionCount(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('trades')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'partial']);
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    logError('getOpenPositionCount', err);
    return 0;
  }
}

export async function getOpenTrades(): Promise<Trade[]> {
  try {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .in('status', ['open', 'partial'])
      .order('placed_at', { ascending: false });
    if (error) throw error;
    return (data as Trade[]) ?? [];
  } catch (err) {
    logError('getOpenTrades', err);
    return [];
  }
}

export async function updateTradeStatus(
  tradeId: number,
  status: TradeStatus,
  extras?: Partial<
    Pick<
      Trade,
      | 'filled_at'
      | 'resolved_at'
      | 'pnl'
      | 'outcome'
      | 'avg_fill_price'
      | 'size_filled'
      | 'size_remaining'
      | 'position_state'
      | 'resolution_status'
      | 'dispute_notes'
    >
  >,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('trades')
      .update({ status, ...extras })
      .eq('id', tradeId);
    if (error) throw error;
  } catch (err) {
    logError('updateTradeStatus', err);
  }
}

// ─── Fills ────────────────────────────────────────────────────────────────────

export async function upsertFill(
  tradeId: number,
  fill: {
    fillSize: number;
    fillPrice: number;
    cumulativeFilled: number;
    remainingSize: number;
    slippage: number;
    executionLatencyMs?: number;
    fillType?: 'partial' | 'complete';
  },
): Promise<Fill | null> {
  try {
    const row: InsertFill = {
      trade_id: tradeId,
      fill_size: fill.fillSize,
      fill_price: fill.fillPrice,
      cumulative_filled: fill.cumulativeFilled,
      remaining_size: fill.remainingSize,
      slippage: fill.slippage,
      execution_latency_ms: fill.executionLatencyMs ?? null,
      fill_type: fill.fillType ?? 'partial',
    };
    const { data, error } = await supabase.from('fills').insert(row).select().single();
    if (error) throw error;
    return data as Fill;
  } catch (err) {
    logError('upsertFill', err);
    return null;
  }
}

// ─── Demo Trades ──────────────────────────────────────────────────────────────

export async function getDemoOpenTrades(): Promise<DemoTrade[]> {
  try {
    const { data, error } = await supabase
      .from('demo_trades')
      .select('*')
      .eq('status', 'open')
      .order('placed_at', { ascending: false });
    if (error) throw error;
    return (data as DemoTrade[]) ?? [];
  } catch (err) {
    logError('getDemoOpenTrades', err);
    return [];
  }
}

export async function incrementDemoBalance(amount: number): Promise<void> {
  try {
    const current = await getSetting('DEMO_CURRENT_BALANCE');
    const newBalance = (parseFloat(current ?? '0') + amount).toFixed(2);
    await upsertSetting('DEMO_CURRENT_BALANCE', newBalance);
  } catch (err) {
    logError('incrementDemoBalance', err);
  }
}

export async function decrementDemoBalance(amount: number): Promise<void> {
  try {
    const current = await getSetting('DEMO_CURRENT_BALANCE');
    const newBalance = Math.max(0, parseFloat(current ?? '0') - amount).toFixed(2);
    await upsertSetting('DEMO_CURRENT_BALANCE', newBalance);
  } catch (err) {
    logError('decrementDemoBalance', err);
  }
}

// ─── Bot Status ───────────────────────────────────────────────────────────────

export async function upsertBotStatus(update: BotStatusUpdate): Promise<void> {
  try {
    const { error } = await supabase
      .from('bot_status')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) throw error;
  } catch (err) {
    logError('upsertBotStatus', err);
  }
}

export async function getBotStatus(): Promise<BotStatus | null> {
  try {
    const { data, error } = await supabase.from('bot_status').select('*').eq('id', 1).single();
    if (error) throw error;
    return data as BotStatus;
  } catch (err) {
    logError('getBotStatus', err);
    return null;
  }
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

export async function getOnboarding(): Promise<Onboarding | null> {
  try {
    const { data, error } = await supabase.from('onboarding').select('*').eq('id', 1).single();
    if (error) throw error;
    return data as Onboarding;
  } catch (err) {
    logError('getOnboarding', err);
    return null;
  }
}

export async function updateOnboarding(
  update: Partial<Omit<Onboarding, 'id'>>,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('onboarding')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) throw error;
  } catch (err) {
    logError('updateOnboarding', err);
  }
}

// ─── Blacklist ────────────────────────────────────────────────────────────────

export async function isBlacklisted(marketId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('blacklisted_markets')
      .select('market_id')
      .eq('market_id', marketId)
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  } catch (err) {
    logError('isBlacklisted', err);
    return false;
  }
}

// ─── Blacklist ────────────────────────────────────────────────────────────────

export async function getBlacklistedMarketIds(): Promise<Set<string>> {
  try {
    const { data, error } = await supabase.from('blacklisted_markets').select('market_id');
    if (error) throw error;
    return new Set((data as { market_id: string }[]).map((r) => r.market_id));
  } catch (err) {
    logError('getBlacklistedMarketIds', err);
    return new Set();
  }
}

// ─── Market Snapshots ─────────────────────────────────────────────────────────

export async function insertMarketSnapshot(snapshot: {
  market_id: string;
  market_question: string;
  category: string;
  yes_price: number;
  no_price: number;
  best_bid: number | null;
  best_ask: number | null;
  spread: number | null;
  volume_usd: number;
  liquidity_usd: number;
  regime: string;
  end_date: string | null;
}): Promise<void> {
  try {
    const { error } = await supabase.from('market_snapshots').insert(snapshot);
    if (error) throw error;
  } catch (err) {
    logError('insertMarketSnapshot', err);
  }
}

export async function getMarketSnapshots(
  from: Date,
  to: Date,
): Promise<MarketSnapshot[]> {
  try {
    const { data, error } = await supabase
      .from('market_snapshots')
      .select('*')
      .gte('snapped_at', from.toISOString())
      .lte('snapped_at', to.toISOString())
      .order('snapped_at', { ascending: true });
    if (error) throw error;
    return (data as MarketSnapshot[]) ?? [];
  } catch (err) {
    logError('getMarketSnapshots', err);
    return [];
  }
}

// ─── PnL ──────────────────────────────────────────────────────────────────────

export async function getTodayPnl(): Promise<number> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('trades')
      .select('pnl')
      .not('pnl', 'is', null)
      .not('resolved_at', 'is', null)
      .gte('resolved_at', today.toISOString());

    if (error) throw error;
    const rows = (data as { pnl: number }[]) ?? [];
    return rows.reduce((sum, r) => sum + (r.pnl ?? 0), 0);
  } catch (err) {
    logError('getTodayPnl', err);
    return 0;
  }
}

export async function getRollingWinRate(lookback: number): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('trades')
      .select('outcome')
      .not('outcome', 'is', null)
      .order('resolved_at', { ascending: false })
      .limit(lookback);

    if (error) throw error;
    const rows = (data as { outcome: string }[]) ?? [];
    if (rows.length === 0) return null;

    const wins = rows.filter((r) => r.outcome === 'win').length;
    return (wins / rows.length) * 100;
  } catch (err) {
    logError('getRollingWinRate', err);
    return null;
  }
}

// ─── Trade resolution ─────────────────────────────────────────────────────────

export async function getFilledPendingTrades(): Promise<Trade[]> {
  try {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'filled')
      .eq('resolution_status', 'pending');
    if (error) throw error;
    return (data as Trade[]) ?? [];
  } catch (err) {
    logError('getFilledPendingTrades', err);
    return [];
  }
}

export async function resolveTrade(
  tradeId: number,
  outcome: 'win' | 'loss',
  pnl: number,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('trades')
      .update({
        status: 'resolved',
        position_state: 'CLOSED',
        outcome,
        pnl,
        resolution_status: 'confirmed',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', tradeId);
    if (error) throw error;
  } catch (err) {
    logError('resolveTrade', err);
  }
}

export async function resolveDemoTrade(
  tradeId: number,
  outcome: 'win' | 'loss',
  pnl: number,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('demo_trades')
      .update({
        status: 'resolved',
        outcome,
        pnl,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', tradeId);
    if (error) throw error;
  } catch (err) {
    logError('resolveDemoTrade', err);
  }
}

// ─── PnL Snapshots ────────────────────────────────────────────────────────────

export async function upsertPnlSnapshot(snapshot: {
  date: string;
  starting_balance: number;
  ending_balance: number;
  trades_placed: number;
  trades_won: number;
  trades_lost: number;
  net_pnl: number;
  roi_percent: number;
  mode: 'demo' | 'live';
}): Promise<void> {
  try {
    const { error } = await supabase
      .from('pnl_snapshots')
      .upsert(snapshot, { onConflict: 'date' });
    if (error) throw error;
  } catch (err) {
    logError('upsertPnlSnapshot', err);
  }
}

export async function getPnlSnapshotHistory(days: number): Promise<PnlSnapshot[]> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data, error } = await supabase
      .from('pnl_snapshots')
      .select('*')
      .gte('date', since.toISOString().slice(0, 10))
      .order('date', { ascending: true });
    if (error) throw error;
    return (data as PnlSnapshot[]) ?? [];
  } catch (err) {
    logError('getPnlSnapshotHistory', err);
    return [];
  }
}

export async function getTodayTradeSummary(
  mode: 'demo' | 'live',
): Promise<{ placed: number; won: number; lost: number; netPnl: number }> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const table = mode === 'demo' ? 'demo_trades' : 'trades';

    const { data, error } = await supabase
      .from(table)
      .select('outcome, pnl')
      .gte('placed_at', today.toISOString());
    if (error) throw error;

    const rows = (data as { outcome: string | null; pnl: number | null }[]) ?? [];
    return {
      placed: rows.length,
      won: rows.filter((r) => r.outcome === 'win').length,
      lost: rows.filter((r) => r.outcome === 'loss').length,
      netPnl: rows.reduce((s, r) => s + (r.pnl ?? 0), 0),
    };
  } catch (err) {
    logError('getTodayTradeSummary', err);
    return { placed: 0, won: 0, lost: 0, netPnl: 0 };
  }
}

// ─── Logging ──────────────────────────────────────────────────────────────────

export async function insertBotLog(log: InsertBotLog): Promise<void> {
  try {
    const { error } = await supabase.from('bot_logs').insert({
      level: log.level,
      message: log.message,
      meta: log.meta ?? null,
    });
    if (error) throw error;
  } catch (err) {
    // Never crash the bot due to a logging failure
    console.error('[DB:insertBotLog]', err instanceof Error ? err.message : err);
  }
}

export async function insertAuditLog(log: InsertAuditLog): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      action: log.action,
      actor: log.actor ?? 'bot',
      entity_type: log.entity_type ?? null,
      entity_id: log.entity_id ?? null,
      previous_value: log.previous_value ?? null,
      new_value: log.new_value ?? null,
      reason: log.reason ?? null,
      ip_address: log.ip_address ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.error('[DB:insertAuditLog]', err instanceof Error ? err.message : err);
  }
}
