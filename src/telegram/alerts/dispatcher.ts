import axios from 'axios';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { escMd } from '../utils/index.js';
import { type AlertPriority, ALERT_THROTTLES, ALERT_EMOJIS } from './types.js';

// ─── Throttle state ───────────────────────────────────────────────────────────
// Tracks per-priority send counts within the current window

interface ThrottleEntry {
  windowStart: number;
  count:       number;
}

const throttleState = new Map<AlertPriority, ThrottleEntry>();

function isThrottled(priority: AlertPriority): boolean {
  const cfg   = ALERT_THROTTLES[priority];
  if (cfg.windowMs === 0) return false; // FATAL — never throttle

  const now   = Date.now();
  const entry = throttleState.get(priority);

  if (!entry || now - entry.windowStart > cfg.windowMs) {
    throttleState.set(priority, { windowStart: now, count: 1 });
    return false;
  }

  if (entry.count >= cfg.maxPerWindow) return true;

  entry.count++;
  return false;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

class AlertDispatcher {
  private readonly token:   string;
  private readonly chatId:  string;
  private readonly enabled: boolean;

  constructor() {
    this.token   = config.TELEGRAM_BOT_TOKEN;
    this.chatId  = config.TELEGRAM_CHAT_ID;
    this.enabled = Boolean(this.token && this.chatId);
  }

  async dispatch(priority: AlertPriority, title: string, body: string): Promise<void> {
    if (!this.enabled) return;

    if (isThrottled(priority)) {
      logger.debug('Alert throttled', { priority, title });
      return;
    }

    const emoji     = ALERT_EMOJIS[priority];
    const timestamp = new Date().toUTCString();
    const text = [
      `${emoji} *\\[PREDIKT ${escMd(priority)}\\]*`,
      `*${escMd(title)}*`,
      escMd(body),
      `\`${escMd(timestamp)}\``,
    ].join('\n');

    await this.send(text, 3);
  }

  private async send(text: string, retries: number): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await axios.post(
          `https://api.telegram.org/bot${this.token}/sendMessage`,
          { chat_id: this.chatId, text, parse_mode: 'MarkdownV2' },
          { timeout: 8_000 },
        );
        return;
      } catch (err) {
        logger.warn('Alert dispatch failed', { attempt: i + 1, error: (err as Error).message });
        if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    }
    logger.error('Alert delivery failed after all retries', { text: text.slice(0, 100) });
  }

  // ─── Convenience methods ─────────────────────────────────────────────────

  async info(title: string, body: string): Promise<void> {
    await this.dispatch('INFO', title, body);
  }

  async warning(title: string, body: string): Promise<void> {
    await this.dispatch('WARNING', title, body);
  }

  async critical(title: string, body: string): Promise<void> {
    await this.dispatch('CRITICAL', title, body);
  }

  async fatal(title: string, body: string): Promise<void> {
    await this.dispatch('FATAL', title, body);
  }

  // ─── Pre-built alert types ───────────────────────────────────────────────

  async tradeAlert(side: string, question: string, size: number, price: number): Promise<void> {
    await this.dispatch('INFO', 'Trade Executed', `${side} $${size.toFixed(2)} @ ${price.toFixed(3)}\n${question.slice(0, 80)}`);
  }

  async riskAlert(reason: string, value?: number, limit?: number): Promise<void> {
    const detail = value != null && limit != null ? ` (${value.toFixed(2)} / ${limit.toFixed(2)})` : '';
    await this.dispatch('WARNING', 'Risk Limit Hit', `${reason}${detail}`);
  }

  async circuitBreakerAlert(name: string, state: string): Promise<void> {
    await this.dispatch('CRITICAL', 'Circuit Breaker', `${name} → ${state}`);
  }

  async emergencyStopAlert(by: string): Promise<void> {
    await this.dispatch('FATAL', 'Emergency Stop', `Triggered by ${by}. All orders cancelled.`);
  }

  async reconciliationAlert(type: string, fixed: number): Promise<void> {
    await this.dispatch('WARNING', 'Reconciliation Mismatch', `${fixed} ${type} discrepancies resolved.`);
  }

  async dailyLossAlert(loss: number, limit: number): Promise<void> {
    await this.dispatch('CRITICAL', 'Daily Loss Limit Hit', `Loss: $${Math.abs(loss).toFixed(2)} / Limit: $${limit.toFixed(2)}`);
  }
}

export const alertDispatcher = new AlertDispatcher();
