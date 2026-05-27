import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { escMd, bold, line, divider } from '../utils/index.js';

export async function modeCommand(ctx: BotContext): Promise<void> {
  const m = await adminApi.getMode();

  const dryTag = m.dry_run ? '⚠️ DRY RUN \\(orders not sent\\)' : '🔴 LIVE \\(real orders\\)';

  const text = [
    `⚙️ ${bold('Trading Mode')}`,
    escMd(divider),
    line('Mode',     m.mode?.toUpperCase() ?? '—'),
    line('Strategy', m.strategy ?? '—'),
    line('State',    m.state ?? '—'),
    '',
    dryTag,
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'MarkdownV2' });
}
