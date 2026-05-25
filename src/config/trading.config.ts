import type { TradeMode } from '../db/types.js';

export interface TradingConfig {
  MODE: TradeMode;
  DEMO_STARTING_BALANCE: number;
  DEMO_CURRENT_BALANCE: number;
  MAX_BET_USD: number;
  MAX_BET_PERCENT: number;
  AUTO_SCALE_BETS: boolean;
  MIN_EDGE_PERCENT: number;
  KELLY_FRACTION: number;
  MAX_OPEN_POSITIONS: number;
  CRON_SCHEDULE: string;
  DRY_RUN: boolean;
  STRATEGY: string;
}
