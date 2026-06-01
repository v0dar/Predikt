import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { escMd, bold } from '../utils/index.js';

export async function scanCommand(ctx: BotContext): Promise<void> {
  await ctx.reply(`🔍 Triggering scan\\.\\.\\.`, { parse_mode: 'MarkdownV2' }).catch(() => {});

  try {
    await adminApi.triggerScan();
    await ctx.reply(
      `✅ ${bold('Scan triggered')}\n${escMd('Markets will be fetched and evaluated. Check /markets in ~30 seconds.')}`,
      { parse_mode: 'MarkdownV2' },
    );
  } catch (err) {
    await ctx.reply(
      `❌ ${bold('Scan failed')}: ${escMd((err as Error).message)}`,
      { parse_mode: 'MarkdownV2' },
    );
  }
}
