import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { formatPositions } from '../formatters/positions.js';

export async function positionsCommand(ctx: BotContext): Promise<void> {
  const positions = await adminApi.getPositions();
  await ctx.reply(formatPositions(positions), { parse_mode: 'MarkdownV2' });
}
