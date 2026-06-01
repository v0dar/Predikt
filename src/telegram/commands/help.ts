import type { BotContext } from '../types/index.js';

export async function helpCommand(ctx: BotContext): Promise<void> {
  const role    = ctx.user?.role ?? 'UNAUTHORIZED';
  const isAdmin = role === 'ADMIN' || role === 'OWNER';
  const isOwner = role === 'OWNER';

  const lines: string[] = [
    '*Predikt Bot — Commands*',
    '───────────────────────────────',
    '',
    '*📊 Status*',
    '/status \\- Bot state, balances, regime',
    '/health \\- Supabase, Redis, state machine',
    '/mode \\- Trading mode and dry run status',
    '/queues \\- Cron schedule and last/next scan',
    '',
    '*📈 Markets & Trades*',
    '/markets \\- Latest scanned markets',
    '/signals \\- Latest market signals',
    '/orders \\- Open orders',
    '/positions \\- Open positions',
    '/trades \\- Last 10 executed trades',
    '',
    '*💰 Portfolio*',
    '/portfolio \\- Balance, exposure, PnL',
    '/performance \\- Win rate, total PnL, 7d summary',
    '/risk \\- Daily loss, exposure, circuit breakers',
    '',
    '*⚙️ Config*',
    '/config \\- Full bot configuration',
    '/strategies \\- Strategy settings and risk limits',
    '',
    '*🔔 Logs*',
    '/alerts \\- Recent warnings and errors',
    '/logs \\- Last 15 bot log entries',
  ];

  if (isAdmin) {
    lines.push('');
    lines.push('*🔧 Admin Controls*');
    lines.push('/scan \\- Force an immediate market scan');
    lines.push('/diagnose \\- Test Polymarket config \\(key, RPC, CLOB\\)');
    lines.push('/pause \\- Pause all new trade executions');
    lines.push('/resume \\- Resume trading operations');
  }

  if (isOwner) {
    lines.push('');
    lines.push('*🛑 Owner Only*');
    lines.push('/recover \\- Clear EMERGENCY\\_STOPPED → READY');
    lines.push('/emergency\\_stop \\- Stop all activity immediately');
  }

  lines.push('');
  lines.push(`_Role: ${role}_`);

  await ctx.reply(lines.join('\n'), { parse_mode: 'MarkdownV2' });
}
