import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { formatPortfolio } from '../formatters/portfolio.js';

export async function portfolioCommand(ctx: BotContext): Promise<void> {
  const portfolio = await adminApi.getPortfolio();
  await ctx.reply(formatPortfolio(portfolio), { parse_mode: 'MarkdownV2' });
}
