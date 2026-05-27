import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { escMd } from '../utils/index.js';

export async function resumeCommand(ctx: BotContext): Promise<void> {
  const result = await adminApi.resume();

  if (result.success) {
    await ctx.reply('▶️ *Bot resumed\\.*\nTrading operations are active\\.', {
      parse_mode: 'MarkdownV2',
    });
  } else {
    await ctx.reply(`❌ Could not resume: ${escMd(result.error ?? 'unknown error')}`, {
      parse_mode: 'MarkdownV2',
    });
  }
}
