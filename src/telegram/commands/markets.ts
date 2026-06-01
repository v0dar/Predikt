import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { formatSignals } from '../formatters/signals.js';

export async function marketsCommand(ctx: BotContext): Promise<void> {
  const signals = await adminApi.getSignals();
  await ctx.reply(formatSignals(signals), { parse_mode: 'MarkdownV2' });
}
