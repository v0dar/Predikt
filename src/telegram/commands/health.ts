import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { formatHealth } from '../formatters/health.js';

export async function healthCommand(ctx: BotContext): Promise<void> {
  const health = await adminApi.getHealth();
  await ctx.reply(formatHealth(health), { parse_mode: 'MarkdownV2' });
}
