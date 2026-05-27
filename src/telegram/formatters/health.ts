import type { HealthResponse } from '../types/index.js';
import { escMd, bold, line, divider, healthEmoji, stateEmoji } from '../utils/index.js';

export function formatHealth(h: HealthResponse): string {
  const overall = h.status === 'ok' ? '✅ All systems operational' : h.status === 'degraded' ? '⚠️ Degraded' : '❌ Error';
  const uptimeMins = Math.floor(h.checks.uptime / 60);

  return [
    bold(escMd('System Health')),
    escMd(divider),
    `${overall}`,
    '',
    `${healthEmoji(h.checks.supabase)} ${bold('Supabase')}: ${escMd(h.checks.supabase)}`,
    `${healthEmoji(h.checks.redis)} ${bold('Redis')}: ${escMd(h.checks.redis)}`,
    `${stateEmoji(h.checks.stateMachine)} ${bold('State Machine')}: ${escMd(h.checks.stateMachine)}`,
    '',
    line('Uptime', uptimeMins < 60 ? `${uptimeMins}m` : `${Math.floor(uptimeMins / 60)}h ${uptimeMins % 60}m`),
    line('Checked', escMd(new Date(h.timestamp).toLocaleTimeString())),
  ].join('\n');
}
