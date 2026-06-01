import type { BotContext } from '../types/index.js';
import { escMd, bold, divider } from '../utils/index.js';
import { supabase } from '../../db/supabase.js';

export async function logsCommand(ctx: BotContext): Promise<void> {
  const { data } = await supabase
    .from('bot_logs')
    .select('level, message, created_at')
    .order('created_at', { ascending: false })
    .limit(15);

  const logs = data ?? [];

  if (!logs.length) {
    await ctx.reply(`📜 ${bold('Recent Logs')}\n${escMd(divider)}\nNo log entries yet\\.`, { parse_mode: 'MarkdownV2' });
    return;
  }

  const levelEmoji: Record<string, string> = {
    error: '🔴', warn: '⚠️', info: 'ℹ️', debug: '🔵', trade: '💰',
  };

  const rows = logs.map(l => {
    const emoji = levelEmoji[l.level ?? 'info'] ?? 'ℹ️';
    const msg   = escMd(String(l.message ?? '—').slice(0, 100));
    const ts    = l.created_at
      ? escMd(new Date(l.created_at).toLocaleTimeString())
      : '—';
    return `${emoji} ${ts}  ${msg}`;
  });

  const text = [`📜 ${bold('Recent Logs')} \\(last 15\\)`, escMd(divider), ...rows].join('\n');
  await ctx.reply(text, { parse_mode: 'MarkdownV2' });
}
