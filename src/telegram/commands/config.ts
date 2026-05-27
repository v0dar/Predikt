import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { escMd, bold, line, divider } from '../utils/index.js';

export async function configCommand(ctx: BotContext): Promise<void> {
  const s = await adminApi.getSettings();

  const dryRun  = s['DRY_RUN']               === 'true';
  const autoScale = s['AUTO_SCALE_BETS']     === 'true';
  const tgNotif = s['TELEGRAM_NOTIFICATIONS'] === 'true';

  const text = [
    `⚙️ ${bold('Bot Configuration')}`,
    escMd(divider),
    line('Mode',          s['MODE']?.toUpperCase() ?? '—'),
    line('Strategy',      s['STRATEGY'] ?? '—'),
    line('Dry Run',       dryRun ? 'Yes' : 'No'),
    '',
    line('Max Bet',       `$${Number(s['MAX_BET_USD'] ?? 10).toFixed(2)}`),
    line('Max Bet %',     `${s['MAX_BET_PERCENT'] ?? '—'}%`),
    line('Min Edge',      `${s['MIN_EDGE_PERCENT'] ?? '—'}%`),
    line('Kelly',         s['KELLY_FRACTION'] ?? '—'),
    line('Max Positions', s['MAX_OPEN_POSITIONS'] ?? '—'),
    line('Daily Loss',    `$${Number(s['DAILY_LOSS_LIMIT_USD'] ?? 50).toFixed(2)}`),
    line('Max Slippage',  `${s['MAX_SLIPPAGE_PERCENT'] ?? '—'}%`),
    '',
    line('Auto Scale',    autoScale ? 'Yes' : 'No'),
    line('Cron',          s['CRON_SCHEDULE'] ?? '—'),
    line('TG Alerts',     tgNotif ? 'On' : 'Off'),
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'MarkdownV2' });
}
