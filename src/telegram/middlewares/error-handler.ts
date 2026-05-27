import type { BotContext } from '../types/index.js';
import { logger } from '../../utils/logger.js';

export async function handleError(err: unknown, ctx: BotContext): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);

  logger.error('Telegram command error', {
    telegramId: ctx.from?.id,
    command:    ctx.message?.text ?? ctx.callbackQuery?.data,
    error:      message,
  });

  try {
    await ctx.reply(`❌ *Error*\n\`${message}\``, { parse_mode: 'Markdown' });
  } catch {
    // If the reply fails too, nothing we can do
  }
}
