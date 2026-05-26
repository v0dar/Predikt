// ─── Onboarding Manager ───────────────────────────────────────────────────────
// Tracks demo and live performance stats, evaluates phase advancement conditions,
// and auto-transitions when thresholds are met.
//
// Phase 1 → 2: 10+ demo trades, ≥50% win rate, 7+ days elapsed
// Phase 2 → 3: 20+ real trades, ≥45% live win rate

import { supabase } from '../db/supabase.js';
import { getOnboarding, updateOnboarding, upsertSetting } from '../db/queries.js';
import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import { logger } from '../utils/logger.js';
import { telegram } from '../utils/telegram.js';

// ─── Phase thresholds ─────────────────────────────────────────────────────────

const PHASE1_MIN_DAYS    = 7;
const PHASE1_MIN_TRADES  = 10;
const PHASE1_MIN_WINRATE = 50;   // %

const PHASE2_MIN_TRADES  = 20;
const PHASE2_MIN_WINRATE = 45;   // %

// ─── Stats sync ───────────────────────────────────────────────────────────────

async function syncStats(): Promise<{
  demoCount: number;
  demoWinRate: number;
  liveCount: number;
  liveWinRate: number;
}> {
  const [demoRes, liveRes] = await Promise.all([
    supabase
      .from('demo_trades')
      .select('outcome')
      .not('outcome', 'is', null),
    supabase
      .from('trades')
      .select('outcome')
      .eq('mode', 'live')
      .not('outcome', 'is', null),
  ]);

  function calcRate(rows: { outcome: string | null }[]): { count: number; winRate: number } {
    const count = rows.length;
    const wins  = rows.filter(r => r.outcome === 'win').length;
    return { count, winRate: count > 0 ? (wins / count) * 100 : 0 };
  }

  const demo = calcRate(demoRes.data ?? []);
  const live = calcRate(liveRes.data ?? []);

  return {
    demoCount:   demo.count,
    demoWinRate: demo.winRate,
    liveCount:   live.count,
    liveWinRate: live.winRate,
  };
}

// ─── Phase 1 → 2 check ────────────────────────────────────────────────────────

function phase1Complete(
  started: string | null,
  demoCount: number,
  demoWinRate: number,
): boolean {
  if (demoCount < PHASE1_MIN_TRADES)  return false;
  if (demoWinRate < PHASE1_MIN_WINRATE) return false;
  if (!started) return false;
  const daysElapsed = (Date.now() - new Date(started).getTime()) / 86_400_000;
  return daysElapsed >= PHASE1_MIN_DAYS;
}

// ─── Phase 2 → 3 check ────────────────────────────────────────────────────────

function phase2Complete(liveCount: number, liveWinRate: number): boolean {
  return liveCount >= PHASE2_MIN_TRADES && liveWinRate >= PHASE2_MIN_WINRATE;
}

// ─── Apply micro live preset ──────────────────────────────────────────────────
// Applies conservative settings when advancing to Phase 2.
// Does NOT flip MODE='live' — user must do that deliberately via dashboard.

async function applyMicroPreset(): Promise<void> {
  const updates: Record<string, string> = {
    MAX_BET_USD:            '1',
    MAX_BET_PERCENT:        '2',
    MIN_EDGE_PERCENT:       '10',
    KELLY_FRACTION:         '0.20',
    MAX_OPEN_POSITIONS:     '2',
    DAILY_LOSS_LIMIT_USD:   '3',
    MAX_SLIPPAGE_PERCENT:   '1',
  };
  for (const [key, value] of Object.entries(updates)) {
    await upsertSetting(key, value);
  }
  logger.info('Micro live preset applied for Phase 2');
}

// ─── Apply standard preset ────────────────────────────────────────────────────

async function applyStandardPreset(): Promise<void> {
  const updates: Record<string, string> = {
    MAX_BET_USD:            '10',
    MAX_BET_PERCENT:        '5',
    MIN_EDGE_PERCENT:       '5',
    KELLY_FRACTION:         '0.25',
    MAX_OPEN_POSITIONS:     '5',
    DAILY_LOSS_LIMIT_USD:   '50',
    MAX_SLIPPAGE_PERCENT:   '2',
  };
  for (const [key, value] of Object.entries(updates)) {
    await upsertSetting(key, value);
  }
  logger.info('Standard preset applied for Phase 3');
}

// ─── Main cycle ───────────────────────────────────────────────────────────────

export async function runOnboardingCycle(): Promise<void> {
  try {
    const ob = await getOnboarding();
    if (!ob) return;

    const { demoCount, demoWinRate, liveCount, liveWinRate } = await syncStats();

    // Always sync current stats into onboarding table
    await updateOnboarding({
      demo_trades_count: demoCount,
      demo_win_rate:     parseFloat(demoWinRate.toFixed(2)),
      live_trades_count: liveCount,
      live_win_rate:     parseFloat(liveWinRate.toFixed(2)),
    });

    const currentPhase = ob.current_phase;

    // ── Phase 1 → 2 ─────────────────────────────────────────────────────────
    if (currentPhase === 1 && phase1Complete(ob.phase1_started_at, demoCount, demoWinRate)) {
      const now = new Date().toISOString();

      await updateOnboarding({
        current_phase:        2,
        phase1_completed_at:  now,
        phase2_started_at:    now,
      });

      await applyMicroPreset();

      eventBus.emit(EVENTS.PHASE_TRANSITION, { from: 1, to: 2 });

      telegram.critical(
        `Phase 1 Complete!\n\n` +
        `Demo results:\n` +
        `Trades: ${demoCount}\n` +
        `Win rate: ${demoWinRate.toFixed(1)}%\n\n` +
        `Ready for Phase 2 - Micro Live.\n` +
        `Micro preset applied ($1 max bet, 10% min edge).\n` +
        `Switch MODE to "live" in Settings when ready.`,
      );

      logger.info('Onboarding advanced: Phase 1 → 2', { demoCount, demoWinRate });
      return;
    }

    // ── Phase 2 → 3 ─────────────────────────────────────────────────────────
    if (currentPhase === 2 && phase2Complete(liveCount, liveWinRate)) {
      const now = new Date().toISOString();

      await updateOnboarding({
        current_phase:        3,
        phase2_completed_at:  now,
        phase3_started_at:    now,
      });

      await applyStandardPreset();

      eventBus.emit(EVENTS.PHASE_TRANSITION, { from: 2, to: 3 });

      telegram.critical(
        `Phase 2 Complete!\n\n` +
        `Live results:\n` +
        `Trades: ${liveCount}\n` +
        `Win rate: ${liveWinRate.toFixed(1)}%\n\n` +
        `Advancing to Phase 3 - Full Live.\n` +
        `Standard preset applied ($10 max bet, 5% min edge).\n` +
        `Scale gradually. The data is in your favour.`,
      );

      logger.info('Onboarding advanced: Phase 2 → 3', { liveCount, liveWinRate });
      return;
    }

    // ── Progress warnings ────────────────────────────────────────────────────
    if (currentPhase === 1) {
      const daysElapsed = ob.phase1_started_at
        ? (Date.now() - new Date(ob.phase1_started_at).getTime()) / 86_400_000
        : 0;
      logger.debug('Phase 1 progress', {
        days:     `${daysElapsed.toFixed(1)}/${PHASE1_MIN_DAYS}`,
        trades:   `${demoCount}/${PHASE1_MIN_TRADES}`,
        winRate:  `${demoWinRate.toFixed(1)}%/${PHASE1_MIN_WINRATE}%`,
      });
    }

    if (currentPhase === 2) {
      logger.debug('Phase 2 progress', {
        trades:  `${liveCount}/${PHASE2_MIN_TRADES}`,
        winRate: `${liveWinRate.toFixed(1)}%/${PHASE2_MIN_WINRATE}%`,
      });
    }
  } catch (err) {
    logger.error('Onboarding cycle failed', { error: (err as Error).message });
  }
}

// ─── Checklist items for dashboard ───────────────────────────────────────────
// Returns the current checklist state for the Phase 1 onboarding card.

export interface ChecklistState {
  phase: number;
  items: { label: string; done: boolean; value: string }[];
  canAdvance: boolean;
}

export async function getChecklistState(): Promise<ChecklistState | null> {
  try {
    const ob = await getOnboarding();
    if (!ob) return null;

    const { demoCount, demoWinRate, liveCount, liveWinRate } = await syncStats();
    const phase = ob.current_phase;

    if (phase === 1) {
      const daysElapsed = ob.phase1_started_at
        ? (Date.now() - new Date(ob.phase1_started_at).getTime()) / 86_400_000
        : 0;
      const items = [
        { label: 'Run for 7 days',      done: daysElapsed >= PHASE1_MIN_DAYS,  value: `${daysElapsed.toFixed(1)} days` },
        { label: '10+ demo trades',      done: demoCount   >= PHASE1_MIN_TRADES, value: `${demoCount} trades` },
        { label: '≥50% demo win rate',   done: demoWinRate >= PHASE1_MIN_WINRATE, value: `${demoWinRate.toFixed(1)}%` },
      ];
      return { phase, items, canAdvance: items.every(i => i.done) };
    }

    if (phase === 2) {
      const items = [
        { label: '20+ live trades',     done: liveCount   >= PHASE2_MIN_TRADES,  value: `${liveCount} trades` },
        { label: '≥45% live win rate',  done: liveWinRate >= PHASE2_MIN_WINRATE, value: `${liveWinRate.toFixed(1)}%` },
      ];
      return { phase, items, canAdvance: items.every(i => i.done) };
    }

    return { phase, items: [{ label: 'Full live mode active', done: true, value: '✓' }], canAdvance: false };
  } catch {
    return null;
  }
}
