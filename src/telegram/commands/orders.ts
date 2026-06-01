import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { escMd, bold, divider, fmtDate } from '../utils/index.js';

export async function ordersCommand(ctx: BotContext): Promise<void> {
  const orders = await adminApi.getOrders();

  if (!orders.length) {
    await ctx.reply(`📋 ${bold('Open Orders')}\n${escMd(divider)}\nNo open orders\\.`, { parse_mode: 'MarkdownV2' });
    return;
  }

  const rows = orders.map((o, i) => {
    const q      = escMd(String(o['market_question'] ?? '—').slice(0, 50));
    const side   = String(o['side'] ?? '—');
    const sideEmoji = side === 'YES' ? '🟢' : '🔴';
    const price  = escMd(Number(o['price'] ?? 0).toFixed(3));
    const size   = escMd(`$${Number(o['size'] ?? 0).toFixed(2)}`);
    const filled = escMd(`$${Number(o['size_filled'] ?? 0).toFixed(2)}`);
    const status = escMd(String(o['status'] ?? '—'));
    const mode   = escMd(String(o['mode'] ?? '—').toUpperCase());
    const date   = escMd(fmtDate(o['placed_at'] as string));

    return [
      `${i + 1}\\. ${sideEmoji} ${bold(q)}`,
      `   ${bold('Price')}: ${price} · ${bold('Size')}: ${size} · ${bold('Filled')}: ${filled}`,
      `   ${bold('Status')}: ${status} · ${bold('Mode')}: ${mode} · ${date}`,
    ].join('\n');
  });

  const text = [`📋 ${bold('Open Orders')}`, escMd(divider), ...rows].join('\n\n');
  await ctx.reply(text, { parse_mode: 'MarkdownV2' });
}
