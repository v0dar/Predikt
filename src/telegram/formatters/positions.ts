import type { PositionItem } from '../types/index.js';
import { escMd, bold, divider, timeAgo } from '../utils/index.js';

export function formatPositions(positions: PositionItem[]): string {
  if (!positions.length) {
    return `📊 ${bold('Active Positions')}\n${escMd(divider)}\nNo open positions\\.`;
  }

  const header = [
    `📊 ${bold('Active Positions')} \\(${positions.length}\\)`,
    escMd(divider),
  ].join('\n');

  const rows = positions.map((p, i) => {
    const q      = escMd((p.market_question ?? '—').slice(0, 55));
    const side   = p.side === 'YES' ? '🟢 YES' : '🔴 NO';
    const filled = Number(p.size_filled).toFixed(2);
    const total  = Number(p.size).toFixed(2);
    const price  = Number(p.price).toFixed(3);
    const mode   = escMd(p.mode?.toUpperCase() ?? '');

    return [
      `${i + 1}\\. ${bold(q)}`,
      `   ${side} · \\$${escMd(filled)}/${escMd(total)} @ ${escMd(price)} · ${mode}`,
      `   Status: ${escMd(p.status)} · ${escMd(timeAgo(p.placed_at))}`,
    ].join('\n');
  });

  return [header, ...rows].join('\n\n');
}
