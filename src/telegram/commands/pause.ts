import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { escMd } from '../utils/index.js';

export async function pauseCommand(ctx: BotContext): Promise<void> {
  const result = await adminApi.pause();

  if (result.success) {
    await ctx.reply('⏸ *Bot paused\\.*\nNo new trades will be placed until resumed\\.', {
      parse_mode: 'MarkdownV2',
    });
  } else {
    await ctx.reply(`❌ Could not pause: ${escMd(result.error ?? 'unknown error')}`, {
      parse_mode: 'MarkdownV2',
    });
  }
}
