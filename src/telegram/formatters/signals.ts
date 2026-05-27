import type { SignalItem } from '../types/index.js';
import { escMd, bold, divider } from '../utils/index.js';

export function formatSignals(signals: SignalItem[]): string {
  if (!signals.length) {
    return `🔍 ${bold('Latest Signals')}\n${escMd(divider)}\nNo signals from last scan\\.`;
  }

  const header = [bold('🔍 Latest Signals'), escMd(divider)].join('\n');

  const rows = signals.map((s, i) => {
    const q       = escMd((s.question ?? '').slice(0, 55));
    const yes     = Number(s.yes_price).toFixed(3);
    const no      = Number(s.no_price).toFixed(3);
    const spread  = s.spread != null ? `${(Number(s.spread) * 100).toFixed(1)}%` : '—';
    const liq     = s.liquidity_usd != null ? `$${Math.round(Number(s.liquidity_usd)).toLocaleString()}` : '—';
    const endNote = s.end_date ? escMd(`ends ${new Date(s.end_date).toLocaleDateString()}`) : '';

    return [
      `${i + 1}\\. ${bold(q)}${s.question && s.question.length > 55 ? '\\.\\.\\.' : ''}`,
      `   YES: ${escMd(yes)} · NO: ${escMd(no)} · Spread: ${escMd(spread)}`,
      `   Liq: ${escMd(liq)} · ${escMd(s.regime ?? 'NORMAL')}${endNote ? ` · ${endNote}` : ''}`,
    ].join('\n');
  });

  return [header, ...rows].join('\n\n');
}
