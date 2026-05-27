import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { escMd, bold } from '../utils/index.js';

export async function recoverCommand(ctx: BotContext): Promise<void> {
  const result = await adminApi.recover();

  if (result.success) {
    await ctx.reply(
      `✅ ${bold('Bot Recovered')}\n\nState machine cleared from EMERGENCY\\_STOPPED\\.\nBot is now ${bold('READY')} — scanning will resume on next cron tick\\.`,
      { parse_mode: 'MarkdownV2' },
    );
  } else {
    const msg = escMd((result as { error?: string }).error ?? 'Recovery failed');
    await ctx.reply(
      `❌ ${bold('Recovery Failed')}\n\n${msg}`,
      { parse_mode: 'MarkdownV2' },
    );
  }
}
