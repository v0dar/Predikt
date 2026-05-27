import type { BotStatusResponse } from '../types/index.js';
import { escMd, bold, line, divider, fmtBalance, timeAgo, stateEmoji } from '../utils/index.js';

export function formatStatus(s: BotStatusResponse): string {
  const state   = s.state ?? '—';
  const emoji   = stateEmoji(state);
  const dryTag  = s.dry_run ? ' \\[DRY RUN\\]' : '';
  const modeTag = escMd(s.mode?.toUpperCase() ?? '—');

  const uptimeMin = s.uptime_seconds ? Math.floor(s.uptime_seconds / 60) : 0;
  const uptime    = uptimeMin < 60 ? `${uptimeMin}m` : `${Math.floor(uptimeMin / 60)}h ${uptimeMin % 60}m`;

  return [
    `${emoji} ${bold(escMd(state))}${dryTag}`,
    escMd(divider),
    line('Mode',       modeTag),
    line('USDC',       fmtBalance(s.usdc_balance)),
    line('MATIC',      s.matic_balance != null ? `${Number(s.matic_balance).toFixed(4)}` : '—'),
    line('Positions',  `${s.open_positions ?? 0} open`),
    line('Regime',     s.current_regime ?? '—'),
    line('Uptime',     uptime),
    line('Last scan',  timeAgo(s.last_scan_at)),
    line('Next scan',  timeAgo(s.next_scan_at)),
  ].join('\n');
}
