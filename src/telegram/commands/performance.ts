import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { escMd, bold, line, divider, fmtUsd, fmtPct } from '../utils/index.js';

export async function performanceCommand(ctx: BotContext): Promise<void> {
  const p = await adminApi.getPerformance();

  const winRate   = p['win_rate']  != null ? fmtPct(Number(p['win_rate']))  : '—';
  const totalPnl  = p['total_pnl'] != null ? fmtUsd(Number(p['total_pnl'])) : '—';
  const todayPnl  = p['today_pnl'] != null ? fmtUsd(Number(p['today_pnl'])) : '—';
  const last7Pnl  = p['last_7d_pnl'] != null ? fmtUsd(Number(p['last_7d_pnl'])) : '—';
  const balance   = p['balance']   != null ? `\\$${escMd(Number(p['balance']).toFixed(2))}` : '—';

  const text = [
    `📈 ${bold('Performance')}`,
    escMd(divider),
    line('Balance',       balance),
    line('Mode',          String(p['mode'] ?? 'demo').toUpperCase()),
    '',
    line('Total trades',  String(p['total_trades']  ?? 0)),
    line('Closed trades', String(p['closed_trades'] ?? 0)),
    line('Win rate',      winRate),
    line('Total PnL',     totalPnl),
    '',
    line('Today trades',  String(p['today_trades'] ?? 0)),
    line('Today PnL',     todayPnl),
    line('Last 7d PnL',   last7Pnl),
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'MarkdownV2' });
}
