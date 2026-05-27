import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type {
  ActionResponse, BotStatusResponse, HealthResponse, ModeResponse,
  PortfolioResponse, PositionItem, RiskResponse, SignalItem, TradeItem,
} from '../types/index.js';

// ─── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      const isRetryable = (err as AxiosError)?.response?.status !== 400
        && (err as AxiosError)?.response?.status !== 401;
      if (!isRetryable || i === retries - 1) break;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw lastError;
}

// ─── Admin API client ─────────────────────────────────────────────────────────

class AdminApiClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: `${config.DASHBOARD_INTERNAL_URL}/api/admin`,
      timeout: 10_000,
      headers: {
        'X-Internal-Secret': config.TELEGRAM_ADMIN_SECRET,
        'Content-Type':      'application/json',
      },
    });

    this.http.interceptors.response.use(
      res => res,
      (err: AxiosError) => {
        const status  = err.response?.status;
        const message = (err.response?.data as Record<string, string>)?.error ?? err.message;
        logger.warn('AdminAPI request failed', { status, message, url: err.config?.url });
        return Promise.reject(new Error(message));
      },
    );
  }

  // ─── Status ─────────────────────────────────────────────────────────────

  async getStatus(): Promise<BotStatusResponse> {
    return withRetry(async () => {
      const { data } = await this.http.get<BotStatusResponse>('/status');
      return data;
    });
  }

  // ─── Health ─────────────────────────────────────────────────────────────

  async getHealth(): Promise<HealthResponse> {
    return withRetry(async () => {
      const { data } = await this.http.get<HealthResponse>('/health');
      return data;
    });
  }

  // ─── Mode ───────────────────────────────────────────────────────────────

  async getMode(): Promise<ModeResponse> {
    return withRetry(async () => {
      const { data } = await this.http.get<ModeResponse>('/mode');
      return data;
    });
  }

  // ─── Signals ────────────────────────────────────────────────────────────

  async getSignals(): Promise<SignalItem[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<SignalItem[]>('/signals');
      return data;
    });
  }

  // ─── Positions ──────────────────────────────────────────────────────────

  async getPositions(): Promise<PositionItem[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<PositionItem[]>('/positions');
      return data;
    });
  }

  // ─── Portfolio ──────────────────────────────────────────────────────────

  async getPortfolio(): Promise<PortfolioResponse> {
    return withRetry(async () => {
      const { data } = await this.http.get<PortfolioResponse>('/portfolio');
      return data;
    });
  }

  // ─── Trades ─────────────────────────────────────────────────────────────

  async getRecentTrades(): Promise<TradeItem[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<TradeItem[]>('/trades');
      return data;
    });
  }

  // ─── Risk ───────────────────────────────────────────────────────────────

  async getRisk(): Promise<RiskResponse> {
    return withRetry(async () => {
      const { data } = await this.http.get<RiskResponse>('/risk');
      return data;
    });
  }

  // ─── Bot controls (ADMIN/OWNER only) ────────────────────────────────────

  async pause(): Promise<ActionResponse> {
    return withRetry(async () => {
      const { data } = await this.http.post<ActionResponse>('/bot/pause');
      return data;
    });
  }

  async resume(): Promise<ActionResponse> {
    return withRetry(async () => {
      const { data } = await this.http.post<ActionResponse>('/bot/resume');
      return data;
    });
  }

  async emergencyStop(): Promise<ActionResponse> {
    const { data } = await this.http.post<ActionResponse>('/bot/emergency-stop');
    return data;
  }

  async triggerScan(): Promise<ActionResponse> {
    return withRetry(async () => {
      const { data } = await this.http.post<ActionResponse>('/bot/scan');
      return data;
    });
  }

  async getSettings(): Promise<Record<string, string>> {
    return withRetry(async () => {
      const { data } = await this.http.get<Record<string, string>>('/settings');
      return data;
    });
  }

  async recover(): Promise<ActionResponse> {
    return withRetry(async () => {
      const { data } = await this.http.post<ActionResponse>('/bot/recover');
      return data;
    });
  }

  async getDiagnose(): Promise<Record<string, unknown>> {
    return withRetry(async () => {
      const { data } = await this.http.get<Record<string, unknown>>('/diagnose');
      return data;
    });
  }
}

export const adminApi = new AdminApiClient();
