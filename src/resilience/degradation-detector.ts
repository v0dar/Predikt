import { logger } from '../utils/logger.js';

// ─── Degradation Detector ─────────────────────────────────────────────────────
// Tracks rolling latency per service and flags gradual degradation — the kind
// that doesn't trigger circuit breakers (no hard failures) but indicates the
// service is struggling. Complements the circuit breaker which handles hard fails.

const WINDOW_SIZE = 20;       // samples to keep per service
const SPIKE_RATIO = 3.0;      // latency × 3 over baseline = spike
const SUSTAINED_RATIO = 2.0;  // latency × 2 for 5+ consecutive samples = sustained degradation

class DegradationDetector {
  private readonly history = new Map<string, number[]>();

  recordLatency(service: string, latencyMs: number): void {
    if (!this.history.has(service)) this.history.set(service, []);
    const samples = this.history.get(service)!;

    samples.push(latencyMs);
    if (samples.length > WINDOW_SIZE) samples.shift();

    if (samples.length >= 5) {
      this.analyse(service, samples, latencyMs);
    }
  }

  private analyse(service: string, samples: number[], latest: number): void {
    // Baseline = median of all samples except the latest
    const prior = samples.slice(0, -1);
    const baseline = this.median(prior);
    if (baseline <= 0) return;

    const ratio = latest / baseline;

    if (ratio >= SPIKE_RATIO) {
      logger.warn(`Latency spike: ${service}`, {
        latencyMs: latest,
        baselineMs: Math.round(baseline),
        ratio: ratio.toFixed(1),
      });
      return;
    }

    // Sustained degradation: last N samples all elevated
    const tail = samples.slice(-5);
    const allElevated = tail.every((s) => s >= baseline * SUSTAINED_RATIO);
    if (allElevated) {
      logger.warn(`Sustained degradation: ${service}`, {
        avgLatencyMs: Math.round(tail.reduce((a, b) => a + b, 0) / tail.length),
        baselineMs: Math.round(baseline),
      });
    }
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);
  }

  getBaseline(service: string): number | null {
    const samples = this.history.get(service);
    if (!samples || samples.length < 3) return null;
    return Math.round(this.median(samples));
  }

  getSummary(): Record<string, { baseline: number | null; samples: number }> {
    const result: Record<string, { baseline: number | null; samples: number }> = {};
    for (const [service, samples] of this.history) {
      result[service] = { baseline: this.getBaseline(service), samples: samples.length };
    }
    return result;
  }
}

export const degradationDetector = new DegradationDetector();
