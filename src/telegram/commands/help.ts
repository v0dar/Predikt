import type { BotContext } from '../types/index.js';

export async function helpCommand(ctx: BotContext): Promise<void> {
  const text = [
    '*Predikt Bot — Command Reference*',
    '───────────────────────────────',
    '',
    '*📊 Monitoring \\(all roles\\)*',
    '/status \\- Bot state, balances, regime',
    '/health \\- Supabase, Redis, state machine',
    '/mode \\- Trading mode, dry run, strategy',
    '/signals \\- Latest scanned market signals',
    '/positions \\- Open positions',
    '/portfolio \\- Balance, exposure, PnL',
    '/trades \\- Last 10 executed trades',
    '/risk \\- Daily loss, exposure, circuit breakers',
    '',
    '*⚙️ Controls \\(ADMIN \\+ OWNER\\)*',
    '/pause \\- Pause all new trade executions',
    '/resume \\- Resume trading operations',
    '',
    '*🛑 Emergency \\(OWNER only\\)*',
    '/emergency\\-stop \\- Stop all activity immediately',
    '',
    '_All controls route through the API layer\\._',
    '_No direct database or strategy access\\._',
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'MarkdownV2' });
}
