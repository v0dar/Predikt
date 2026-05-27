import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { formatRisk } from '../formatters/risk.js';

export async function riskCommand(ctx: BotContext): Promise<void> {
  const risk = await adminApi.getRisk();
  await ctx.reply(formatRisk(risk), { parse_mode: 'MarkdownV2' });
}
