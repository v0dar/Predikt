import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import { logger } from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BreakerName = 'polymarket_api' | 'polygon_rpc' | 'supabase';
export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface BreakerConfig {
  threshold: number;   // failures before opening
  windowMs: number;    // window to count failures in
  cooldownMs: number;  // time to stay OPEN before testing recovery
}

interface BreakerData {
  state: BreakerState;
  failures: number[];  // timestamps
  openedAt: number | null;
  config: BreakerConfig;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIGS: Record<BreakerName, BreakerConfig> = {
  polymarket_api: { threshold: 5, windowMs: 60_000, cooldownMs: 300_000 },
  polygon_rpc:    { threshold: 3, windowMs: 30_000, cooldownMs: 120_000 },
  supabase:       { threshold: 5, windowMs: 60_000, cooldownMs:  60_000 },
};

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

class CircuitBreakerManager {
  private readonly breakers = new Map<BreakerName, BreakerData>();

  constructor() {
    for (const [name, config] of Object.entries(CONFIGS) as [BreakerName, BreakerConfig][]) {
      this.breakers.set(name, { state: 'CLOSED', failures: [], openedAt: null, config });
    }
  }

  recordFailure(name: BreakerName): void {
    const b = this.breakers.get(name);
    if (!b) return;

    const now = Date.now();
    b.failures = b.failures.filter((t) => now - t < b.config.windowMs);
    b.failures.push(now);

    if (b.state !== 'OPEN' && b.failures.length >= b.config.threshold) {
      b.state = 'OPEN';
      b.openedAt = now;
      logger.warn(`Circuit breaker opened: ${name}`, { failures: b.failures.length });
      eventBus.emit(EVENTS.CIRCUIT_BREAKER_OPEN, { name, state: 'OPEN', failures: b.failures.length });
    }
  }

  recordSuccess(name: BreakerName): void {
    const b = this.breakers.get(name);
    if (!b || b.state !== 'HALF_OPEN') return;

    b.state = 'CLOSED';
    b.failures = [];
    b.openedAt = null;
    logger.info(`Circuit breaker closed: ${name} — service recovered`);
    eventBus.emit(EVENTS.CIRCUIT_BREAKER_CLOSED, { name, state: 'CLOSED' });
  }

  isOpen(name: BreakerName): boolean {
    const b = this.breakers.get(name);
    if (!b || b.state === 'CLOSED') return false;

    if (b.state === 'OPEN' && b.openedAt) {
      const elapsed = Date.now() - b.openedAt;
      if (elapsed > b.config.cooldownMs) {
        b.state = 'HALF_OPEN';
        logger.info(`Circuit breaker half-open: ${name} — probing recovery`);
      }
    }

    return b.state === 'OPEN';
  }

  anyOpen(): boolean {
    for (const name of Object.keys(CONFIGS) as BreakerName[]) {
      if (this.isOpen(name)) return true;
    }
    return false;
  }

  getStates(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, b] of this.breakers) {
      result[name] = b.state;
    }
    return result;
  }
}

export const circuitBreaker = new CircuitBreakerManager();
