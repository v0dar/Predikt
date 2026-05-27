import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { formatStatus } from '../formatters/status.js';

export async function statusCommand(ctx: BotContext): Promise<void> {
  const status = await adminApi.getStatus();
  await ctx.reply(formatStatus(status), { parse_mode: 'MarkdownV2' });
}
