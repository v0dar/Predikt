import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { escMd, bold, divider } from '../utils/index.js';

export async function alertsCommand(ctx: BotContext): Promise<void> {
  const alerts = await adminApi.getAlerts();

  if (!alerts.length) {
    await ctx.reply(`🔔 ${bold('Recent Alerts')}\n${escMd(divider)}\nNo recent warnings or errors\\.`, { parse_mode: 'MarkdownV2' });
    return;
  }

  const rows = alerts.map((a, i) => {
    const lvl  = String(a['level'] ?? 'warn').toUpperCase();
    const emoji = lvl === 'ERROR' ? '🔴' : '⚠️';
    const msg  = escMd(String(a['message'] ?? '—').slice(0, 120));
    const ts   = a['created_at']
      ? escMd(new Date(a['created_at'] as string).toLocaleTimeString())
      : '—';
    return `${i + 1}\\. ${emoji} ${bold(lvl)} · ${ts}\n   ${msg}`;
  });

  const text = [`🔔 ${bold('Recent Alerts')}`, escMd(divider), ...rows].join('\n\n');
  await ctx.reply(text, { parse_mode: 'MarkdownV2' });
}
