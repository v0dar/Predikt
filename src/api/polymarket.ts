import axios, { type AxiosInstance } from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

// ─── API response types ───────────────────────────────────────────────────────

export interface PolymarketToken {
  token_id: string;
  outcome: 'Yes' | 'No' | string;
  price: number;
  winner: boolean;
}

export interface PolymarketMarket {
  condition_id: string;
  question_id: string;
  question: string;
  description: string;
  market_slug: string;
  category: string;
  end_date_iso: string;
  active: boolean;
  closed: boolean;
  tokens: PolymarketToken[];
  minimum_order_size: string;
  minimum_tick_size: string;
  // Enriched via Gamma API
  volume?: number;
  liquidity?: number;
}

export interface OrderBookEntry {
  price: number;
  size: number;
}

export interface OrderBook {
  market: string;
  asset_id: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  hash: string;
}

export interface NormalisedMarket {
  id: string;
  question: string;
  category: string;
  endDate: Date | null;
  yesTokenId: string;
  noTokenId: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  minimumOrderSize: number;
  tickSize: number;
  active: boolean;
}

// ─── Gamma API types (market metadata) ───────────────────────────────────────

interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  endDate: string;
  category: string;
  volume: string;
  liquidity: string;
  active: boolean;
  closed: boolean;
}

// ─── Client ───────────────────────────────────────────────────────────────────

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE = config.POLYMARKET_API_BASE;

class PolymarketClient {
  private readonly gamma: AxiosInstance;
  private readonly clob: AxiosInstance;

  constructor() {
    this.gamma = axios.create({
      baseURL: GAMMA_BASE,
      timeout: 15_000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.clob = axios.create({
      baseURL: CLOB_BASE,
      timeout: 15_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Market data ──────────────────────────────────────────────────────────────

  async getMarkets(limit = 100, offset = 0): Promise<NormalisedMarket[]> {
    return withRetry(async () => {
      // Fetch from CLOB (prices + token IDs) and Gamma (volume + liquidity) in parallel
      const [clobResp, gammaResp] = await Promise.all([
        this.clob.get<{ data: PolymarketMarket[]; count: number; next_cursor: string }>(
          '/markets',
          { params: { limit, offset, active: true, closed: false } },
        ),
        this.gamma.get<GammaMarket[]>('/markets', {
          params: { limit, offset, active: true, closed: false, order: 'volume', ascending: false },
        }),
      ]);

      const gammaMap = new Map(
        (gammaResp.data ?? []).map((m) => [m.conditionId.toLowerCase(), m]),
      );

      return (clobResp.data.data ?? [])
        .filter((m) => m.tokens.length === 2)
        .map((m) => this.normalise(m, gammaMap.get(m.condition_id.toLowerCase())));
    });
  }

  async getMarket(conditionId: string): Promise<NormalisedMarket | null> {
    return withRetry(async () => {
      const resp = await this.clob.get<PolymarketMarket>(`/markets/${conditionId}`);
      return this.normalise(resp.data);
    }).catch((err) => {
      logger.warn('Failed to fetch market', { conditionId, error: (err as Error).message });
      return null;
    });
  }

  async getOrderBook(tokenId: string): Promise<OrderBook | null> {
    return withRetry(async () => {
      const resp = await this.clob.get<{
        market: string;
        asset_id: string;
        bids: { price: string; size: string }[];
        asks: { price: string; size: string }[];
        hash: string;
      }>('/book', { params: { token_id: tokenId } });

      return {
        market: resp.data.market,
        asset_id: resp.data.asset_id,
        hash: resp.data.hash,
        bids: resp.data.bids.map((b) => ({ price: parseFloat(b.price), size: parseFloat(b.size) })),
        asks: resp.data.asks.map((a) => ({ price: parseFloat(a.price), size: parseFloat(a.size) })),
      };
    }).catch((err) => {
      const status = (err as { response?: { status?: number } }).response?.status;
      // 404 = market has no active order book (common in PRE_RESOLUTION) — not an error
      if (status === 404) {
        logger.debug('No order book for token (market likely pre-resolution)', { tokenId });
      } else {
        logger.warn('Failed to fetch order book', { tokenId, error: (err as Error).message });
      }
      return null;
    });
  }

  async getLastTradePrice(tokenId: string): Promise<number | null> {
    return withRetry(async () => {
      const resp = await this.clob.get<{ price: string }>('/last-trade-price', {
        params: { token_id: tokenId },
      });
      return parseFloat(resp.data.price);
    }).catch(() => null);
  }

  async getMidpoint(tokenId: string): Promise<number | null> {
    return withRetry(async () => {
      const resp = await this.clob.get<{ mid: string }>('/midpoint', {
        params: { token_id: tokenId },
      });
      return parseFloat(resp.data.mid);
    }).catch(() => null);
  }

  // Returns 'YES'/'NO'/'INVALID' if market resolved, null if still live
  async getMarketResolution(conditionId: string): Promise<'YES' | 'NO' | 'INVALID' | null> {
    return withRetry(async () => {
      const resp = await this.clob.get<PolymarketMarket>(`/markets/${conditionId}`);
      const market = resp.data;

      const yes = market.tokens.find((t) => t.outcome === 'Yes');
      const no = market.tokens.find((t) => t.outcome === 'No');

      if (yes?.winner) return 'YES';
      if (no?.winner) return 'NO';

      // Price-threshold fallback for APIs that don't expose winner field
      if (yes && yes.price >= 0.99) return 'YES';
      if (yes && yes.price <= 0.01) return 'NO';

      // Closed with no clear winner = invalid/voided
      if (market.closed && !market.active) return 'INVALID';

      return null;
    }).catch(() => null);
  }

  // ── Health check ─────────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    try {
      await this.clob.get('/markets', { params: { limit: 1 } });
      return true;
    } catch {
      return false;
    }
  }

  // ── Normalisation ─────────────────────────────────────────────────────────────

  private normalise(raw: PolymarketMarket, gamma?: GammaMarket): NormalisedMarket {
    const yes = raw.tokens.find((t) => t.outcome === 'Yes') ?? raw.tokens[0]!;
    const no = raw.tokens.find((t) => t.outcome === 'No') ?? raw.tokens[1]!;

    return {
      id: raw.condition_id,
      question: raw.question,
      category: gamma?.category ?? raw.category ?? 'unknown',
      endDate: raw.end_date_iso ? new Date(raw.end_date_iso) : null,
      yesTokenId: yes.token_id,
      noTokenId: no.token_id,
      yesPrice: yes.price,
      noPrice: no.price,
      volume: gamma ? parseFloat(gamma.volume) : 0,
      liquidity: gamma ? parseFloat(gamma.liquidity) : 0,
      minimumOrderSize: parseFloat(raw.minimum_order_size ?? '1'),
      tickSize: parseFloat(raw.minimum_tick_size ?? '0.001'),
      active: raw.active,
    };
  }
}

export const polymarket = new PolymarketClient();
