import type { PortfolioResponse } from '../types/index.js';
import { escMd, bold, line, divider, fmtBalance, fmtUsd } from '../utils/index.js';

export function formatPortfolio(p: PortfolioResponse): string {
  const pnlSign  = (p.today_pnl ?? 0) >= 0 ? '📈' : '📉';
  const exposure = `$${Number(p.total_exposure).toFixed(2)}`;

  return [
    `💼 ${bold('Portfolio Summary')}`,
    escMd(divider),
    line('Balance',    fmtBalance(p.total_balance)),
    line('Exposure',   escMd(exposure)),
    line('Positions',  `${p.open_positions} open`),
    line('Today PnL',  `${pnlSign} ${escMd(fmtUsd(p.today_pnl))}`),
    line('Today trades', `${p.today_trades}`),
    '',
    line('Mode',    escMd(p.mode?.toUpperCase() ?? '—')),
    line('Regime',  escMd(p.regime ?? '—')),
  ].join('\n');
}
