import type { StrategyContext, TradeIntent } from './sandbox.js';

// Abstract base class for all strategies.
// Subclasses implement evaluate() and nothing else — no DB, no API, no side effects.
export abstract class BaseStrategy {
  abstract readonly name: string;

  abstract evaluate(context: StrategyContext): TradeIntent[];

  toString(): string {
    return `Strategy(${this.name})`;
  }
}
