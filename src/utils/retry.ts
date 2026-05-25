import axios from 'axios';
import { logger } from './logger.js';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULTS = { maxRetries: 3, baseDelayMs: 1_000, maxDelayMs: 30_000 };

// Reads Retry-After header — supports both seconds and HTTP date formats
function retryAfterMs(error: unknown): number | null {
  if (!axios.isAxiosError(error)) return null;
  const header = error.response?.headers['retry-after'] as string | undefined;
  if (!header) return null;
  const seconds = parseFloat(header);
  if (!isNaN(seconds)) return seconds * 1_000;
  const date = new Date(header);
  if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
  return null;
}

function isRetryable(error: unknown, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries) return false;
  if (!axios.isAxiosError(error)) return true; // network-level errors always retry
  const status = error.response?.status;
  if (!status) return true; // no response at all
  return [429, 500, 502, 503, 504].includes(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (!isRetryable(err, attempt, opts.maxRetries)) throw lastError;

      const fromHeader = retryAfterMs(err);
      const exponential = opts.baseDelayMs * 2 ** attempt;
      const jitter = Math.random() * opts.baseDelayMs;
      const delayMs = fromHeader ?? Math.min(exponential + jitter, opts.maxDelayMs);

      const is429 = axios.isAxiosError(err) && err.response?.status === 429;
      logger.warn(is429 ? 'Rate limited — backing off' : 'Request failed, retrying', {
        attempt: attempt + 1,
        maxRetries: opts.maxRetries,
        delayMs: Math.round(delayMs),
        error: lastError.message,
      });

      options?.onRetry?.(attempt + 1, lastError, delayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
