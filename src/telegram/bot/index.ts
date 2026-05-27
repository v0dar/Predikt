import { Bot } from 'grammy';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type { BotContext } from '../types/index.js';
import { authMiddleware } from '../middlewares/auth.js';
import { loggerMiddleware } from '../middlewares/logger.js';
import { handleError } from '../middlewares/error-handler.js';
import { registerCommands } from '../commands/index.js';

let botInstance: Bot<BotContext> | null = null;

export function createBot(): Bot<BotContext> {
  if (!config.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const bot = new Bot<BotContext>(config.TELEGRAM_BOT_TOKEN);

  // ─── Global middleware stack (order matters) ───────────────────────────
  bot.use(loggerMiddleware);
  bot.use(authMiddleware);

  // ─── Commands ──────────────────────────────────────────────────────────
  registerCommands(bot);

  // ─── Global error handler ──────────────────────────────────────────────
  bot.catch(({ error, ctx }) => {
    void handleError(error, ctx);
  });

  botInstance = bot;
  return bot;
}

export function getBot(): Bot<BotContext> | null {
  return botInstance;
}

export async function startBot(): Promise<void> {
  const bot = createBot();

  bot.on('message', async (ctx, next) => {
    // Pass-through — commands handle their own logic
    await next();
  });

  logger.info('Telegram bot starting in polling mode');
  await bot.start({
    onStart: (info) => {
      logger.info('Telegram bot connected', { username: info.username, id: info.id });
    },
    drop_pending_updates: true,
  });
}

export async function stopBot(): Promise<void> {
  if (botInstance) {
    await botInstance.stop();
    logger.info('Telegram bot stopped');
    botInstance = null;
  }
}
