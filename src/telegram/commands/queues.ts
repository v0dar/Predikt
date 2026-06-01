import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { escMd, bold, line, divider } from '../utils/index.js';

export async function queuesCommand(ctx: BotContext): Promise<void> {
  const status = await adminApi.getStatus();

  // Cron jobs / queue state derived from bot status
  const state   = String(status.state ?? '—');
  const lastScan = status.last_scan_at
    ? escMd(new Date(status.last_scan_at as string).toLocaleTimeString())
    : '—';
  const nextScan = status.next_scan_at
    ? escMd(new Date(status.next_scan_at as string).toLocaleTimeString())
    : '—';

  const text = [
    `⚙️ ${bold('Scheduled Queues')}`,
    escMd(divider),
    line('Bot state',         state),
    line('Last scan',         lastScan),
    line('Next scan',         nextScan),
    '',
    `${bold('Cron jobs')}`,
    escMd('• Market scan       every 5 min'),
    escMd('• Reconcile orders  every 2 min'),
    escMd('• Reconcile fills   every 5 min'),
    escMd('• Balance sync      every 5 min'),
    escMd('• Position sync     every 1 hr'),
    escMd('• Daily snapshot    midnight'),
    escMd('• Status upsert     every 10 sec'),
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'MarkdownV2' });
}
