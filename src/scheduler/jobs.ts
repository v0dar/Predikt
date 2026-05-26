import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { withLock } from '../locks/index.js';
import { stateMachine } from '../core/state-machine.js';
import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import { getAllSettings, getSetting } from '../config/index.js';
import { marketScanner } from '../market-scanner/scanner.js';
import { riskEngine } from '../risk/engine.js';
import { executionEngine } from '../execution/engine.js';
import { portfolioEngine } from '../portfolio/engine.js';
import { reconcileOpenOrders } from '../reconciliation/orders.js';
import { reconcileBalances } from '../reconciliation/balances.js';
import { reconcileFills } from '../reconciliation/fills.js';
import { reconcilePositions } from '../reconciliation/positions.js';
import { reconcileMarketState } from '../reconciliation/market-state.js';
import { writeDailySnapshot } from '../portfolio/snapshot.js';
import { runHealthCheck } from '../resilience/health-monitor.js';
import { analyticsTracker } from '../analytics/tracker.js';
import { buildStrategyContext } from '../strategy/sandbox.js';
import { valueBetStrategy } from '../strategy/value-bet.js';
import { getOpenTrades, upsertBotStatus, getOpenPositionCount } from '../db/queries.js';
import type { BaseStrategy } from '../strategy/base.js';
import type { Position } from '../db/types.js';

// ─── Strategy registry ────────────────────────────────────────────────────────

function getStrategy(name: string): BaseStrategy {
  if (name === 'value-bet') return valueBetStrategy;
  logger.warn(`Unknown strategy '${name}', falling back to value-bet`);
  return valueBetStrategy;
}

// ─── Main scan cycle ──────────────────────────────────────────────────────────

async function runScanCycle(): Promise<void> {
  if (!stateMachine.canScan()) {
    logger.debug('Scan skipped', { state: stateMachine.state });
    return;
  }

  stateMachine.transition('SCANNING');
  const cycleStart = Date.now();

  try {
    const settings = await getAllSettings();

    // 1. Fetch markets + detect regime
    const { markets, regime } = await marketScanner.scan();

    if (markets.length === 0) {
      logger.warn('No eligible markets returned from scanner');
      stateMachine.transition('READY');
      return;
    }

    // 2. Get current balance for context
    let currentBalance: number;
    if (settings.MODE === 'demo') {
      const raw = await getSetting('DEMO_CURRENT_BALANCE');
      currentBalance = parseFloat(raw ?? String(settings.DEMO_CURRENT_BALANCE));
    } else {
      const { usdc_balance } = (await import('../db/queries.js').then(
        (m) => m.getBotStatus(),
      )) ?? { usdc_balance: 0 };
      currentBalance = usdc_balance ?? 0;
    }

    // 3. Open positions for context
    const openTrades = await getOpenTrades();
    const openPositions = openTrades as unknown as Position[];

    // 4. Fetch order books for top markets by liquidity (cap at 30 to limit API calls)
    const topMarkets = [...markets].sort((a, b) => b.liquidity - a.liquidity).slice(0, 30);
    const tokenIds = topMarkets.flatMap((m) => [m.yesTokenId, m.noTokenId]);
    const orderBooks = await marketScanner.fetchOrderBooks(tokenIds);

    // 5. Build strategy context
    const context = buildStrategyContext(
      markets,
      orderBooks,
      currentBalance,
      openPositions,
      settings,
      regime,
    );

    // 6. Run active strategy
    const strategy = getStrategy(settings.STRATEGY);
    const intents = strategy.evaluate(context);

    logger.info(`Scan complete: ${markets.length} markets, ${intents.length} signals`, {
      regime,
      strategy: strategy.name,
      durationMs: Date.now() - cycleStart,
    });

    // 7. Emit signals
    for (const intent of intents) {
      eventBus.emit(EVENTS.SIGNAL_GENERATED, {
        marketId: intent.marketId,
        question: intent.marketQuestion,
        side: intent.side,
        trueProb: intent.trueProb,
        ev: intent.ev,
        suggestedSize: intent.suggestedSize,
        strategyName: intent.strategyName,
      });
    }

    // 8. Risk-validate and execute each intent sequentially
    for (const intent of intents) {
      const orderBook = orderBooks[intent.tokenId] ?? null;
      const decision = await riskEngine.validate(intent, settings, orderBook);
      if (decision.approved) {
        await executionEngine.execute(intent, settings);
      }
    }

    stateMachine.transition('READY');

    // Update bot_status
    const openCount = await getOpenPositionCount();
    await upsertBotStatus({
      state: 'READY',
      running: true,
      dry_run: settings.DRY_RUN,
      mode: settings.MODE,
      current_regime: regime,
      open_positions: openCount,
      last_scan_at: new Date().toISOString(),
    });

    // Invalidate portfolio cache after each cycle
    portfolioEngine.invalidateCache();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Scan cycle failed', { error: msg });

    try {
      stateMachine.transition('ERROR_RECOVERY');
    } catch {
      // Already in a non-SCANNING state — nothing to do
    }

    // Auto-recover after 10 seconds
    setTimeout(() => {
      try {
        stateMachine.transition('READY');
      } catch {
        // If we can't recover, stay in current state
      }
    }, 10_000);
  }
}

// ─── Status heartbeat ─────────────────────────────────────────────────────────

async function heartbeat(): Promise<void> {
  try {
    await upsertBotStatus({
      state: stateMachine.state,
      running: stateMachine.isRunning(),
    });
  } catch {
    // Never crash from a heartbeat failure
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export interface Scheduler {
  stop: () => void;
}

export async function startScheduler(): Promise<Scheduler> {
  const settings = await getAllSettings();
  const tasks: cron.ScheduledTask[] = [];

  // Main scan cycle — interval from settings (default */5 * * * *)
  const scanSchedule = settings.CRON_SCHEDULE;
  if (!cron.validate(scanSchedule)) {
    throw new Error(`Invalid CRON_SCHEDULE: '${scanSchedule}'`);
  }

  tasks.push(
    cron.schedule(scanSchedule, () => {
      void withLock('scan', 60_000, runScanCycle);
    }),
  );

  // Reconciliation jobs
  tasks.push(
    cron.schedule('*/2 * * * *', () => {
      void withLock('reconcile:orders', 30_000, reconcileOpenOrders);
    }),
  );

  tasks.push(
    cron.schedule('*/5 * * * *', () => {
      void withLock('reconcile:fills', 30_000, reconcileFills);
    }),
  );

  tasks.push(
    cron.schedule('*/5 * * * *', () => {
      void withLock('reconcile:balances', 30_000, reconcileBalances);
    }),
  );

  tasks.push(
    cron.schedule('0 * * * *', () => {
      void withLock('position:sync', 60_000, reconcilePositions);
    }),
  );

  tasks.push(
    cron.schedule('15 * * * *', () => {
      void withLock('market:state', 60_000, reconcileMarketState);
    }),
  );

  // Daily midnight snapshot
  tasks.push(
    cron.schedule('0 0 * * *', () => {
      void withLock('snapshot', 60_000, writeDailySnapshot);
    }),
  );

  // Health check every 5 minutes
  tasks.push(
    cron.schedule('*/5 * * * *', () => {
      void runHealthCheck();
    }),
  );

  // Analytics summary every hour
  tasks.push(cron.schedule('0 * * * *', () => analyticsTracker.logSummary()));

  // Status heartbeat every 30 seconds (6-field cron)
  tasks.push(cron.schedule('*/30 * * * * *', () => void heartbeat()));

  logger.info('Scheduler started', {
    scanSchedule,
    jobs: tasks.length,
  });

  // Run an immediate scan and balance sync on startup
  void reconcileBalances();
  void withLock('scan', 60_000, runScanCycle);

  return {
    stop: () => {
      tasks.forEach((t) => t.stop());
      logger.info('Scheduler stopped');
    },
  };
}
