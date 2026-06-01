import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { escMd, bold, line, divider } from '../utils/index.js';

export async function strategiesCommand(ctx: BotContext): Promise<void> {
  const s = await adminApi.getSettings();

  const dryTag = s['DRY_RUN'] === 'true'
    ? '⚠️ DRY RUN \\(orders not sent\\)'
    : '🔴 LIVE \\(real orders\\)';

  const text = [
    `🎯 ${bold('Strategy Config')}`,
    escMd(divider),
    line('Strategy',     s['STRATEGY']          ?? 'value-bet'),
    line('Mode',         (s['MODE'] ?? 'demo').toUpperCase()),
    '',
    `${bold('Entry filters')}`,
    line('Min edge',     `${s['MIN_EDGE_PERCENT'] ?? 5}%`),
    line('Kelly fraction', s['KELLY_FRACTION']   ?? '0.25'),
    line('Max bet',      `$${s['MAX_BET_USD'] ?? 10}`),
    line('Max bet %',    `${s['MAX_BET_PERCENT'] ?? 5}%`),
    line('Auto scale',   s['AUTO_SCALE_BETS'] === 'true' ? 'Yes' : 'No'),
    '',
    `${bold('Risk limits')}`,
    line('Max positions', s['MAX_OPEN_POSITIONS'] ?? 5),
    line('Daily loss limit', `$${s['DAILY_LOSS_LIMIT_USD'] ?? 50}`),
    line('Max slippage', `${s['MAX_SLIPPAGE_PERCENT'] ?? 2}%`),
    '',
    dryTag,
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'MarkdownV2' });
}
