import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { escMd } from '../utils/index.js';

// Pending confirmations: telegramId → timestamp
const pendingConfirmations = new Map<number, number>();
const CONFIRM_TTL_MS = 30_000;

export async function emergencyStopCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.user.telegramId;
  pendingConfirmations.set(userId, Date.now());

  const keyboard = new InlineKeyboard()
    .text('🛑 YES — STOP EVERYTHING', 'estop:confirm')
    .text('Cancel', 'estop:cancel');

  await ctx.reply(
    '⚠️ *EMERGENCY STOP*\n\nThis will immediately:\n• Cancel ALL open orders\n• Halt the bot\n• Require manual resume\n\nAre you sure?',
    { parse_mode: 'MarkdownV2', reply_markup: keyboard },
  );
}

export async function handleEmergencyStopCallback(ctx: BotContext): Promise<void> {
  const userId = ctx.user.telegramId;
  const data   = ctx.callbackQuery?.data;

  await ctx.answerCallbackQuery();

  if (data === 'estop:cancel') {
    pendingConfirmations.delete(userId);
    await ctx.editMessageText('↩️ Emergency stop cancelled\\.', { parse_mode: 'MarkdownV2' });
    return;
  }

  if (data === 'estop:confirm') {
    const pending = pendingConfirmations.get(userId);
    if (!pending || Date.now() - pending > CONFIRM_TTL_MS) {
      await ctx.editMessageText('⏰ Confirmation expired\\. Run /emergency\\-stop again\\.', { parse_mode: 'MarkdownV2' });
      return;
    }

    pendingConfirmations.delete(userId);

    try {
      const result = await adminApi.emergencyStop();
      if (result.success) {
        await ctx.editMessageText(
          `🛑 *EMERGENCY STOP EXECUTED*\n\nBot state: ${escMd(result.state ?? 'EMERGENCY_STOPPED')}\nAll orders cancelled\\.`,
          { parse_mode: 'MarkdownV2' },
        );
      } else {
        await ctx.editMessageText(`❌ Emergency stop failed: ${escMd(result.error ?? 'unknown')}`, { parse_mode: 'MarkdownV2' });
      }
    } catch (err) {
      await ctx.editMessageText(`❌ ${escMd((err as Error).message)}`, { parse_mode: 'MarkdownV2' });
    }
  }
}
