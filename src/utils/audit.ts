import { insertAuditLog } from '../db/queries.js';

// ─── All auditable actions in the system ─────────────────────────────────────

export type AuditAction =
  | 'setting.changed'
  | 'trade.rejected'
  | 'trade.placed'
  | 'trade.cancelled'
  | 'bot.started'
  | 'bot.stopped'
  | 'bot.paused'
  | 'bot.resumed'
  | 'bot.emergency_stopped'
  | 'state.changed'
  | 'phase.transition'
  | 'market.blacklisted'
  | 'market.unblacklisted'
  | 'strategy.toggled'
  | 'position.resolved'
  | 'position.disputed'
  | 'order.placed'
  | 'order.cancelled'
  | 'wallet.approved'
  | 'wallet.withdrawn'
  | 'circuit_breaker.opened'
  | 'circuit_breaker.closed'
  | 'reconcile.mismatch'
  | 'backtest.run';

export interface AuditDetails {
  actor?: 'bot' | 'dashboard_user';
  entityType?: string;
  entityId?: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
}

// ─── Immutable audit trail writer — non-blocking, never throws ────────────────

export async function audit(action: AuditAction, details: AuditDetails = {}): Promise<void> {
  void insertAuditLog({
    action,
    actor: details.actor ?? 'bot',
    entity_type: details.entityType ?? null,
    entity_id: details.entityId ?? null,
    previous_value: details.previousValue ?? null,
    new_value: details.newValue ?? null,
    reason: details.reason ?? null,
    ip_address: details.ipAddress ?? null,
  }).catch(() => {
    // Intentionally silent — audit failures must not interrupt trading
  });
}
