import axios from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { stateMachine } from '../core/state-machine.js';

// ─── Alert levels ─────────────────────────────────────────────────────────────

export type AlertLevel = 'INFO' | 'WARNING' | 'CRITICAL' | 'FATAL';

const LEVEL_CONFIG: Record<AlertLevel, { emoji: string; autoPause: boolean; emergency: boolean }> = {
  INFO:     { emoji: 'ℹ️',  autoPause: false, emergency: false },
  WARNING:  { emoji: '⚠️',  autoPause: false, emergency: false },
  CRITICAL: { emoji: '🔴',  autoPause: true,  emergency: false },
  FATAL:    { emoji: '💀',  autoPause: false, emergency: true  },
};

// ─── Telegram Notifier ────────────────────────────────────────────────────────

class TelegramNotifier {
  private readonly token: string;
  private readonly chatId: string;
  private readonly enabled: boolean;
  // Simple per-level dedup: suppress identical messages within 60s
  private lastMessages = new Map<string, number>();
  private readonly dedupWindowMs = 60_000;

  constructor() {
    this.token = config.TELEGRAM_BOT_TOKEN;
    this.chatId = config.TELEGRAM_CHAT_ID;
    this.enabled = Boolean(this.token && this.chatId);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private isDuplicate(level: AlertLevel, message: string): boolean {
    const key = `${level}:${message}`;
    const last = this.lastMessages.get(key) ?? 0;
    if (Date.now() - last < this.dedupWindowMs) return true;
    this.lastMessages.set(key, Date.now());
    return false;
  }

  private async send(level: AlertLevel, message: string): Promise<void> {
    if (!this.enabled) return;
    if (this.isDuplicate(level, message)) return;

    const { emoji, autoPause, emergency } = LEVEL_CONFIG[level];
    const timestamp = new Date().toUTCString();
    const text = `${emoji} *[PREDIKT ${level}]*\n${message}\n\`${timestamp}\``;

    try {
      await axios.post(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        { chat_id: this.chatId, text, parse_mode: 'Markdown' },
        { timeout: 8_000 },
      );
    } catch (err) {
      logger.warn('Telegram message failed to send', { error: (err as Error).message });
    }

    // Side-effect: auto-pause or emergency stop for high-severity alerts
    if (autoPause && stateMachine.state === 'READY') {
      try {
        stateMachine.transition('PAUSED');
        logger.warn('Bot auto-paused due to CRITICAL alert');
      } catch {
        // Not in a pauseable state — ignore
      }
    }

    if (emergency) {
      try {
        stateMachine.transition('EMERGENCY_STOPPED');
        logger.error('Bot emergency-stopped due to FATAL alert');
      } catch {
        // Already stopped or not in a stoppable state
      }
    }
  }

  info(message: string): void {
    void this.send('INFO', message);
  }

  warning(message: string): void {
    void this.send('WARNING', message);
  }

  critical(message: string): void {
    void this.send('CRITICAL', message);
  }

  fatal(message: string): void {
    void this.send('FATAL', message);
  }
}

export const telegram = new TelegramNotifier();
