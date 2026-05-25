import { withLock } from '../locks/index.js';
import { stateMachine } from '../core/state-machine.js';
import { signer, type UnsignedOrder } from '../wallet/signer.js';
import { clobClient } from '../api/clob.js';
import { eventBus } from '../events/event-bus.js';
import { EVENTS } from '../events/event-types.js';
import { logger } from '../utils/logger.js';
import { toMicroUsdc } from '../utils/math.js';
import {
  insertTrade,
  insertDemoTrade,
  decrementDemoBalance,
} from '../db/queries.js';
import type { TradeIntent } from '../strategy/sandbox.js';
import type { BotSettings } from '../db/types.js';

// ─── Execution Engine ─────────────────────────────────────────────────────────
// The only module that talks to the CLOB. Always runs under a per-market lock.

class ExecutionEngine {
  async execute(intent: TradeIntent, settings: BotSettings): Promise<void> {
    await withLock(`trade:${intent.marketId}`, 30_000, async () => {
      if (settings.MODE === 'demo') {
        await this.executeDemoTrade(intent, settings);
      } else if (settings.DRY_RUN) {
        this.logDryRun(intent);
      } else {
        await this.executeLiveTrade(intent, settings);
      }
    });
  }

  // ── Demo trade ───────────────────────────────────────────────────────────────

  private async executeDemoTrade(intent: TradeIntent, settings: BotSettings): Promise<void> {
    const size = Math.min(intent.suggestedSize, settings.MAX_BET_USD);

    const trade = await insertDemoTrade({
      market_id: intent.marketId,
      market_question: intent.marketQuestion,
      side: intent.side,
      price: intent.suggestedPrice,
      size,
      true_prob: intent.trueProb,
      ev: intent.ev,
      kelly_size: intent.kellySize,
      strategy_name: intent.strategyName,
      regime: null,
    });

    if (!trade) {
      logger.error('Failed to insert demo trade', { market: intent.marketId });
      return;
    }

    await decrementDemoBalance(size);

    eventBus.emit(EVENTS.POSITION_OPENED, {
      tradeId: trade.id,
      marketId: intent.marketId,
      question: intent.marketQuestion,
      side: intent.side,
      size,
      price: intent.suggestedPrice,
    });

    logger.trade('Demo trade placed', {
      tradeId: trade.id,
      market: intent.marketQuestion,
      side: intent.side,
      price: intent.suggestedPrice,
      size: `$${size.toFixed(2)}`,
      ev: `${intent.ev.toFixed(1)}%`,
    });
  }

  // ── Dry run ───────────────────────────────────────────────────────────────────

  private logDryRun(intent: TradeIntent): void {
    logger.info('[DRY RUN] Would place order', {
      market: intent.marketQuestion,
      side: intent.side,
      price: intent.suggestedPrice,
      size: `$${intent.suggestedSize.toFixed(2)}`,
      ev: `${intent.ev.toFixed(1)}%`,
      tokenId: intent.tokenId,
    });
  }

  // ── Live trade ───────────────────────────────────────────────────────────────

  private async executeLiveTrade(intent: TradeIntent, settings: BotSettings): Promise<void> {
    stateMachine.transition('PLACING_ORDER');

    try {
      const size = Math.min(intent.suggestedSize, settings.MAX_BET_USD);
      const sharesExpected = size / intent.suggestedPrice;

      const unsignedOrder: UnsignedOrder = {
        tokenId: intent.tokenId,
        makerAmount: toMicroUsdc(size),
        takerAmount: BigInt(Math.round(sharesExpected * 1_000_000)),
        side: 0, // BUY — we always buy the outcome token
      };

      const signed = await signer.signOrder(unsignedOrder);
      stateMachine.transition('WAITING_CONFIRMATION');

      const resp = await clobClient.placeOrder(signed, 'GTC');

      if (!resp.success) {
        throw new Error(resp.errorMsg ?? 'CLOB rejected the order');
      }

      const trade = await insertTrade({
        market_id: intent.marketId,
        market_question: intent.marketQuestion,
        order_id: resp.orderID,
        side: intent.side,
        price: intent.suggestedPrice,
        size,
        true_prob: intent.trueProb,
        ev: intent.ev,
        kelly_size: intent.kellySize,
        strategy_name: intent.strategyName,
        mode: 'live',
      });

      if (!trade) {
        logger.error('Trade placed on CLOB but failed to persist to DB', {
          orderId: resp.orderID,
          market: intent.marketId,
        });
      }

      eventBus.emit(EVENTS.ORDER_SUBMITTED, {
        tradeId: trade?.id ?? 0,
        orderId: resp.orderID,
        marketId: intent.marketId,
        question: intent.marketQuestion,
        side: intent.side,
        size,
        price: intent.suggestedPrice,
      });

      logger.trade('Live order placed', {
        orderId: resp.orderID,
        status: resp.status,
        market: intent.marketQuestion,
        side: intent.side,
        size: `$${size.toFixed(2)}`,
      });

      stateMachine.transition('READY');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Order placement failed', { market: intent.marketId, error: msg });

      eventBus.emit(EVENTS.ORDER_FAILED, {
        marketId: intent.marketId,
        reason: 'placement-error',
        error: msg,
      });

      stateMachine.transition('ERROR_RECOVERY');
      // Allow recovery — transition back to READY after a brief pause
      setTimeout(() => {
        try { stateMachine.transition('READY'); } catch { /* already in safe state */ }
      }, 5_000);
    }
  }
}

export const executionEngine = new ExecutionEngine();
