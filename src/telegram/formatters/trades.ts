import type { TradeItem } from '../types/index.js';
import { escMd, bold, divider, timeAgo, fmtUsd } from '../utils/index.js';

export function formatTrades(trades: TradeItem[]): string {
  if (!trades.length) {
    return `📋 ${bold('Recent Trades')}\n${escMd(divider)}\nNo trades recorded yet\\.`;
  }

  const header = [
    `📋 ${bold('Recent Trades')} \\(last ${trades.length}\\)`,
    escMd(divider),
  ].join('\n');

  const rows = trades.map((t, i) => {
    const q      = escMd((t.market_question ?? '—').slice(0, 50));
    const side   = t.side === 'YES' ? '🟢 YES' : '🔴 NO';
    const pnlTag = t.pnl != null ? escMd(fmtUsd(t.pnl)) : '—';
    const status = escMd(t.status);
    const mode   = escMd(t.mode?.toUpperCase() ?? '');

    return [
      `${i + 1}\\. ${bold(q)}`,
      `   ${side} · \\$${escMd(Number(t.size).toFixed(2))} @ ${escMd(Number(t.price).toFixed(3))} · ${mode}`,
      `   ${status} · PnL: ${pnlTag} · ${escMd(timeAgo(t.placed_at))}`,
    ].join('\n');
  });

  return [header, ...rows].join('\n\n');
}
