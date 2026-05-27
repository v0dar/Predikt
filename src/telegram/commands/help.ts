import type { BotContext } from '../types/index.js';

export async function helpCommand(ctx: BotContext): Promise<void> {
  const role    = ctx.user?.role ?? 'UNAUTHORIZED';
  const isAdmin = role === 'ADMIN' || role === 'OWNER';
  const isOwner = role === 'OWNER';

  const lines: string[] = [
    '*Predikt Bot — Commands*',
    '───────────────────────────────',
    '',
    '*📊 Monitoring*',
    '/status \\- Bot state, balances, regime',
    '/health \\- Supabase, Redis, state machine',
    '/mode \\- Trading mode and dry run status',
    '/config \\- Full bot configuration',
    '/signals \\- Latest scanned market signals',
    '/positions \\- Open positions',
    '/portfolio \\- Balance, exposure, PnL',
    '/trades \\- Last 10 executed trades',
    '/risk \\- Daily loss, exposure, circuit breakers',
  ];

  if (isAdmin) {
    lines.push('');
    lines.push('*⚙️ Controls*');
    lines.push('/diagnose \\- Test Polymarket config \\(key, RPC, CLOB\\)');
    lines.push('/pause \\- Pause all new trade executions');
    lines.push('/resume \\- Resume trading operations');
  }

  if (isOwner) {
    lines.push('');
    lines.push('*🛑 Emergency \\(OWNER only\\)*');
    lines.push('/recover \\- Clear EMERGENCY\\_STOPPED → READY');
    lines.push('/emergency\\_stop \\- Stop all activity immediately');
  }

  lines.push('');
  lines.push(`_Role: ${role}_`);

  await ctx.reply(lines.join('\n'), { parse_mode: 'MarkdownV2' });
}
