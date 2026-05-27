import type { NextFunction } from 'grammy';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type { BotContext, Role } from '../types/index.js';

// ─── Role assignment ──────────────────────────────────────────────────────────
// IDs are comma-separated strings in env. Parsed once at startup.

function parseIds(raw: string): Set<number> {
  return new Set(
    raw.split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0),
  );
}

const ownerIds = parseIds(config.TELEGRAM_OWNER_IDS);
const adminIds = parseIds(config.TELEGRAM_ADMIN_IDS);
const viewerIds = parseIds(config.TELEGRAM_VIEWER_IDS);

function resolveRole(telegramId: number): Role {
  if (ownerIds.has(telegramId)) return 'OWNER';
  if (adminIds.has(telegramId)) return 'ADMIN';
  if (viewerIds.has(telegramId)) return 'VIEWER';
  return 'UNAUTHORIZED';
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

export async function authMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  const from = ctx.from;
  if (!from) {
    await ctx.reply('Could not identify sender. Message must come from a user.');
    return;
  }

  const role = resolveRole(from.id);

  ctx.user = {
    telegramId: from.id,
    username:   from.username,
    firstName:  from.first_name,
    role,
  };

  if (role === 'UNAUTHORIZED') {
    logger.warn('Unauthorized Telegram access attempt', {
      telegramId: from.id,
      username:   from.username,
      command:    ctx.message?.text,
    });
    await ctx.reply('⛔ Access denied. You are not authorized to use this bot.');
    return;
  }

  await next();
}

// ─── Role guard factory ───────────────────────────────────────────────────────

export function requireRole(...allowed: Role[]) {
  return async (ctx: BotContext, next: NextFunction): Promise<void> => {
    if (!allowed.includes(ctx.user.role)) {
      logger.warn('Insufficient permissions for command', {
        telegramId: ctx.user.telegramId,
        role:       ctx.user.role,
        required:   allowed,
        command:    ctx.message?.text,
      });
      await ctx.reply(`⛔ This command requires role: *${allowed.join(' or ')}*`, { parse_mode: 'Markdown' });
      return;
    }
    await next();
  };
}
