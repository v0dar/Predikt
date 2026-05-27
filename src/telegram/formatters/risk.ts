import type { RiskResponse } from '../types/index.js';
import { escMd, bold, line, divider } from '../utils/index.js';

export function formatRisk(r: RiskResponse): string {
  const lossUsed    = r.daily_loss_today != null ? Math.abs(Number(r.daily_loss_today)) : 0;
  const lossLimit   = Number(r.daily_loss_limit);
  const lossPercent = lossLimit > 0 ? ((lossUsed / lossLimit) * 100).toFixed(0) : '0';
  const lossBar     = buildBar(lossUsed, lossLimit, 10);

  const posUsed  = r.open_positions;
  const posMax   = r.max_positions;
  const posBar   = buildBar(posUsed, posMax, 10);

  const cbStatus = formatCircuitBreakers(r.circuit_breakers);

  return [
    `🛡 ${bold('Risk Exposure')}`,
    escMd(divider),
    `${bold('Daily Loss')}: \\$${escMd(lossUsed.toFixed(2))} / \\$${escMd(lossLimit.toFixed(2))} \\(${escMd(lossPercent)}%\\)`,
    `${escMd(lossBar)}`,
    '',
    `${bold('Positions')}: ${escMd(String(posUsed))}/${escMd(String(posMax))}`,
    `${escMd(posBar)}`,
    '',
    line('Total exposure',  `$${Number(r.total_exposure).toFixed(2)}`),
    line('Max bet',         `$${Number(r.max_bet_usd).toFixed(2)}`),
    line('Min edge',        `${Number(r.min_edge_percent).toFixed(1)}%`),
    line('Drawdown',        `${Number(r.current_drawdown_pct).toFixed(1)}%`),
    '',
    bold('Circuit Breakers'),
    cbStatus,
  ].join('\n');
}

function buildBar(used: number, max: number, len: number): string {
  if (max <= 0) return '░'.repeat(len);
  const filled = Math.min(Math.round((used / max) * len), len);
  const pct    = used / max;
  const char   = pct > 0.8 ? '█' : pct > 0.5 ? '▓' : '░';
  return char.repeat(filled) + '░'.repeat(len - filled);
}

function formatCircuitBreakers(cb: Record<string, unknown> | null): string {
  if (!cb || typeof cb !== 'object') return escMd('All closed ✅');
  return Object.entries(cb)
    .map(([name, state]) => `  ${escMd(name)}: ${escMd(String(state))}`)
    .join('\n') || escMd('All closed ✅');
}
