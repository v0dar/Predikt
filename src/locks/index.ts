import Redis from 'ioredis';
import Redlock from 'redlock';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// ─── Redis + Redlock singleton ────────────────────────────────────────────────

let redis: Redis | null = null;
let redlock: Redlock | null = null;
let redisAvailable = false;

export function initRedis(): void {
  try {
    redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: false,
      connectTimeout: 5000,
    });

    redis.on('ready', () => {
      redisAvailable = true;
      logger.info('Redis connected.');
    });

    redis.on('error', (err: Error) => {
      if (redisAvailable) {
        logger.warn('Redis connection error', { error: err.message });
      }
      redisAvailable = false;
    });

    redis.on('close', () => {
      redisAvailable = false;
    });

    // retryCount: 0 — never queue, never wait. If locked → skip the cycle.
    redlock = new Redlock([redis], {
      retryCount: 0,
      retryDelay: 0,
      driftFactor: 0.01,
      automaticExtensionThreshold: 500,
    });

    redlock.on('error', () => {
      // Suppress Redlock internal errors — handled per-call in withLock
    });
  } catch (err) {
    logger.warn('Redis unavailable — distributed locking disabled. Bot will run unlocked.', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => redis?.disconnect());
    redis = null;
    redlock = null;
    redisAvailable = false;
    logger.info('Redis disconnected.');
  }
}

// ─── withLock — acquire → run → release ──────────────────────────────────────
// If lock is already held: skips fn() entirely (retryCount: 0).
// If Redis is down: runs fn() without locking (acceptable for single-instance demo).
// Lock key is namespaced as `lock:{key}` in Redis.

export async function withLock(
  key: string,
  ttlMs: number,
  fn: () => Promise<void>,
): Promise<void> {
  if (!redlock || !redisAvailable) {
    logger.warn(`Running without lock: ${key} (Redis unavailable)`);
    await fn();
    return;
  }

  const resource = `lock:${key}`;
  let lock: Awaited<ReturnType<Redlock['acquire']>>;

  try {
    lock = await redlock.acquire([resource], ttlMs);
  } catch {
    logger.warn(`Skipped — lock held: ${key}`);
    return;
  }

  try {
    await fn();
  } finally {
    await lock.release().catch(() => {
      // Lock may have expired — harmless for retryCount: 0
    });
  }
}

// ─── Named locks used in the system ──────────────────────────────────────────
// 'scan'               — main strategy cycle (prevents cron overlap)
// 'trade:{marketId}'   — per-market order placement (prevents duplicate orders)
// 'reconcile:orders'   — order reconciliation job
// 'reconcile:fills'    — fill reconciliation job
// 'reconcile:balances' — balance sync
// 'position:sync'      — position lifecycle updates
// 'snapshot'           — daily PnL snapshot writer

export { redisAvailable };
