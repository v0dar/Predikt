import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { formatTrades } from '../formatters/trades.js';

export async function tradesCommand(ctx: BotContext): Promise<void> {
  const trades = await adminApi.getRecentTrades();
  await ctx.reply(formatTrades(trades), { parse_mode: 'MarkdownV2' });
}
