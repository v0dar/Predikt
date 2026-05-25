import { logger } from '../utils/logger.js';
import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import {
  getTodayTradeSummary,
  getPnlSnapshotHistory,
  upsertPnlSnapshot,
  getSetting,
  getBotStatus,
} from '../db/queries.js';
import { getAllSettings } from '../config/index.js';

// Writes a daily PnL snapshot row at midnight.
// Called by the midnight cron in Phase 9.
export async function writeDailySnapshot(): Promise<void> {
  const settings = await getAllSettings();
  const mode = settings.MODE;
  const today = new Date().toISOString().slice(0, 10);

  // Yesterday's ending balance = today's starting balance
  const history = await getPnlSnapshotHistory(2);
  const yesterday = history.find((s) => s.date !== today);

  let startingBalance: number;
  if (yesterday?.ending_balance) {
    startingBalance = yesterday.ending_balance;
  } else if (mode === 'demo') {
    const raw = await getSetting('DEMO_STARTING_BALANCE');
    startingBalance = parseFloat(raw ?? '500');
  } else {
    const status = await getBotStatus();
    startingBalance = status?.usdc_balance ?? 0;
  }

  let endingBalance: number;
  if (mode === 'demo') {
    const raw = await getSetting('DEMO_CURRENT_BALANCE');
    endingBalance = parseFloat(raw ?? '500');
  } else {
    const status = await getBotStatus();
    endingBalance = status?.usdc_balance ?? startingBalance;
  }

  const summary = await getTodayTradeSummary(mode);
  const netPnl = endingBalance - startingBalance;
  const roiPercent = startingBalance > 0 ? (netPnl / startingBalance) * 100 : 0;

  await upsertPnlSnapshot({
    date: today,
    starting_balance: startingBalance,
    ending_balance: endingBalance,
    trades_placed: summary.placed,
    trades_won: summary.won,
    trades_lost: summary.lost,
    net_pnl: netPnl,
    roi_percent: roiPercent,
    mode,
  });

  eventBus.emit(EVENTS.DAILY_SNAPSHOT, {
    date: today,
    pnl: netPnl,
    tradesPlaced: summary.placed,
    winRate: summary.placed > 0 ? (summary.won / summary.placed) * 100 : 0,
    endingBalance,
    mode,
  });

  logger.info('Daily PnL snapshot written', {
    date: today,
    startingBalance: `$${startingBalance.toFixed(2)}`,
    endingBalance: `$${endingBalance.toFixed(2)}`,
    netPnl: `$${netPnl.toFixed(2)}`,
    roi: `${roiPercent.toFixed(2)}%`,
    trades: summary.placed,
    mode,
  });
}
