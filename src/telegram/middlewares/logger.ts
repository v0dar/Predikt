import type { NextFunction } from 'grammy';
import { logger } from '../../utils/logger.js';
import type { BotContext } from '../types/index.js';

export async function loggerMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  const command = ctx.message?.text ?? ctx.callbackQuery?.data ?? '<unknown>';
  const start   = Date.now();

  await next();

  logger.info('Telegram command handled', {
    telegramId: ctx.from?.id,
    username:   ctx.from?.username,
    role:       ctx.user?.role,
    command,
    durationMs: Date.now() - start,
  });
}
