import type { BotContext } from '../types/index.js';
import { escMd } from '../utils/index.js';

export async function startCommand(ctx: BotContext): Promise<void> {
  const { role, firstName } = ctx.user;

  const viewerCmds = [
    '/status \\- Bot state and balances',
    '/health \\- System health check',
    '/mode \\- Current trading mode',
    '/signals \\- Latest market signals',
    '/positions \\- Active positions',
    '/portfolio \\- Portfolio summary',
    '/trades \\- Recent trades',
    '/risk \\- Risk exposure',
  ];

  const adminCmds = [
    '/pause \\- Pause trading',
    '/resume \\- Resume trading',
  ];

  const ownerCmds = [
    '/emergency\\-stop \\- Halt all activity immediately',
  ];

  const lines = [
    `👋 Welcome, *${escMd(firstName)}\\!*`,
    '',
    `You are authenticated as *${escMd(role)}*\\.`,
    '',
    '*Available commands:*',
    '',
    ...viewerCmds,
  ];

  if (role === 'ADMIN' || role === 'OWNER') {
    lines.push('', '*Admin controls:*', ...adminCmds);
  }

  if (role === 'OWNER') {
    lines.push('', '*Owner controls:*', ...ownerCmds);
  }

  await ctx.reply(lines.join('\n'), { parse_mode: 'MarkdownV2' });
}
