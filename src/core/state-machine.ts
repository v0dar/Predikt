import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import { logger } from '../utils/logger.js';
import type { BotState } from '../db/types.js';

// ─── Valid state transitions ──────────────────────────────────────────────────
// Any state can transition to EMERGENCY_STOPPED or SHUTTING_DOWN.
// All other transitions are explicitly whitelisted below.

const VALID_TRANSITIONS: Record<BotState, BotState[]> = {
  BOOTING:               ['SYNCING', 'EMERGENCY_STOPPED', 'SHUTTING_DOWN'],
  SYNCING:               ['READY', 'EMERGENCY_STOPPED', 'SHUTTING_DOWN'],
  READY:                 ['SCANNING', 'PAUSED', 'EMERGENCY_STOPPED', 'SHUTTING_DOWN'],
  SCANNING:              ['PLACING_ORDER', 'READY', 'EMERGENCY_STOPPED', 'SHUTTING_DOWN'],
  PLACING_ORDER:         ['WAITING_CONFIRMATION', 'ERROR_RECOVERY', 'READY', 'EMERGENCY_STOPPED', 'SHUTTING_DOWN'],
  WAITING_CONFIRMATION:  ['READY', 'ERROR_RECOVERY', 'EMERGENCY_STOPPED', 'SHUTTING_DOWN'],
  ERROR_RECOVERY:        ['READY', 'EMERGENCY_STOPPED', 'SHUTTING_DOWN'],
  PAUSED:                ['READY', 'EMERGENCY_STOPPED', 'SHUTTING_DOWN'],
  EMERGENCY_STOPPED:     ['READY', 'SHUTTING_DOWN'],
  SHUTTING_DOWN:         [],
};

// ─── State Machine ────────────────────────────────────────────────────────────

class StateMachine {
  private _state: BotState = 'BOOTING';

  get state(): BotState {
    return this._state;
  }

  transition(newState: BotState): void {
    const allowed = VALID_TRANSITIONS[this._state];

    if (!allowed.includes(newState)) {
      throw new Error(
        `Invalid state transition: ${this._state} → ${newState}. ` +
          `Allowed from ${this._state}: [${allowed.join(', ') || 'none'}]`,
      );
    }

    const from = this._state;
    this._state = newState;

    logger.info(`State: ${from} → ${newState}`);

    eventBus.emit(EVENTS.STATE_CHANGED, { from, to: newState });

    if (newState === 'EMERGENCY_STOPPED') {
      eventBus.emit(EVENTS.EMERGENCY_STOPPED, {});
    }

    if (newState === 'PAUSED') {
      eventBus.emit(EVENTS.BOT_PAUSED, { reason: 'state_machine_transition' });
    }

    if (from === 'PAUSED' && newState === 'READY') {
      eventBus.emit(EVENTS.BOT_RESUMED, { by: 'auto' });
    }
  }

  // ── Guard methods used by scan cycle and risk engine ─────────────────────────

  canScan(): boolean {
    return this._state === 'READY';
  }

  canTrade(): boolean {
    return this._state === 'SCANNING';
  }

  isRunning(): boolean {
    return this._state !== 'EMERGENCY_STOPPED' && this._state !== 'SHUTTING_DOWN';
  }

  isPaused(): boolean {
    return this._state === 'PAUSED';
  }
}

export const stateMachine = new StateMachine();
