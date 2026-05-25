import { EventEmitter } from 'events';
import type { EventPayloads, EventName } from './event-types.js';

// ─── Typed wrapper around Node.js EventEmitter ────────────────────────────────
// Enforces payload types at compile time. All inter-module communication
// must go through here — no direct module-to-module calls.

type Listener<K extends EventName> = (payload: EventPayloads[K]) => void;

class TypedEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Increase limit — we have many subscribers across modules
    this.emitter.setMaxListeners(50);
  }

  emit<K extends EventName>(event: K, payload: EventPayloads[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends EventName>(event: K, listener: Listener<K>): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  once<K extends EventName>(event: K, listener: Listener<K>): void {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
  }

  off<K extends EventName>(event: K, listener: Listener<K>): void {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  removeAllListeners(event?: EventName): void {
    this.emitter.removeAllListeners(event);
  }

  listenerCount(event: EventName): number {
    return this.emitter.listenerCount(event);
  }
}

export const eventBus = new TypedEventBus();
