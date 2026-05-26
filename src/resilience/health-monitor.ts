import { ethers } from 'ethers';
import { polymarket } from '../api/polymarket.js';
import { supabase } from '../db/supabase.js';
import { circuitBreaker } from '../risk/circuit-breaker.js';
import { degradationDetector } from './degradation-detector.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

// ─── Individual service checks ────────────────────────────────────────────────

async function checkPolymarketApi(): Promise<boolean> {
  const start = Date.now();
  try {
    const ok = await polymarket.ping();
    const ms = Date.now() - start;
    degradationDetector.recordLatency('polymarket_api', ms);

    if (ok) {
      circuitBreaker.recordSuccess('polymarket_api');
      logger.debug('Health OK: polymarket_api', { ms });
      return true;
    } else {
      circuitBreaker.recordFailure('polymarket_api');
      logger.warn('Health FAIL: polymarket_api returned false');
      return false;
    }
  } catch (err) {
    circuitBreaker.recordFailure('polymarket_api');
    logger.warn('Health FAIL: polymarket_api', { error: (err as Error).message });
    return false;
  }
}

async function checkSupabase(): Promise<boolean> {
  const start = Date.now();
  try {
    const { error } = await supabase.from('bot_status').select('id').eq('id', 1).single();
    const ms = Date.now() - start;

    if (error) throw error;
    degradationDetector.recordLatency('supabase', ms);
    circuitBreaker.recordSuccess('supabase');
    logger.debug('Health OK: supabase', { ms });
    return true;
  } catch (err) {
    circuitBreaker.recordFailure('supabase');
    logger.warn('Health FAIL: supabase', { error: (err as Error).message });
    return false;
  }
}

async function checkPolygonRpc(): Promise<boolean> {
  // Skip RPC check in demo mode — no private key means no on-chain activity
  if (!config.PRIVATE_KEY) return true;

  const start = Date.now();
  try {
    const provider = new ethers.JsonRpcProvider(config.RPC_URL);
    await provider.getBlockNumber();
    const ms = Date.now() - start;

    degradationDetector.recordLatency('polygon_rpc', ms);
    circuitBreaker.recordSuccess('polygon_rpc');
    logger.debug('Health OK: polygon_rpc', { ms });
    return true;
  } catch (err) {
    circuitBreaker.recordFailure('polygon_rpc');
    logger.warn('Health FAIL: polygon_rpc', { error: (err as Error).message });
    return false;
  }
}

// ─── Composite health check ───────────────────────────────────────────────────

export interface HealthReport {
  polymarket_api: boolean;
  supabase: boolean;
  polygon_rpc: boolean;
  allHealthy: boolean;
  checkedAt: string;
}

export async function runHealthCheck(): Promise<HealthReport> {
  const [polymarketOk, supabaseOk, rpcOk] = await Promise.all([
    checkPolymarketApi(),
    checkSupabase(),
    checkPolygonRpc(),
  ]);

  const allHealthy = polymarketOk && supabaseOk && rpcOk;

  const report: HealthReport = {
    polymarket_api: polymarketOk,
    supabase: supabaseOk,
    polygon_rpc: rpcOk,
    allHealthy,
    checkedAt: new Date().toISOString(),
  };

  if (!allHealthy) {
    logger.warn('Health check: degraded services detected', {
      polymarket_api: polymarketOk,
      supabase: supabaseOk,
      polygon_rpc: rpcOk,
    });
  }

  return report;
}
