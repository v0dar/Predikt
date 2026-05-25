import axios, { type AxiosInstance } from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { signer, type SignedOrder } from '../wallet/signer.js';

// ─── CLOB response types ──────────────────────────────────────────────────────

export type ClobOrderStatus =
  | 'LIVE'
  | 'MATCHED'
  | 'DELAYED'
  | 'FILLED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'UNMATCHED';

export interface ClobOrder {
  id: string;
  status: ClobOrderStatus;
  market: string;        // condition_id
  asset_id: string;      // token_id
  side: 'BUY' | 'SELL';
  price: string;
  original_size: string;
  size_matched: string;
  created_at: number;
  updated_at: number;
  outcome: string;
  owner: string;
  maker_address: string;
  expiration: string;
  type: 'GTC' | 'GTD' | 'FOK';
  associate_trades: ClobTrade[];
}

export interface ClobTrade {
  id: string;
  taker_order_id: string;
  market: string;
  asset_id: string;
  side: 'BUY' | 'SELL';
  size: string;
  fee_rate_bps: string;
  price: string;
  status: string;
  match_time: string;
  last_update: string;
  outcome: string;
  bucket_index: number;
  owner: string;
  maker_address: string;
  transaction_hash: string;
  trader_side: 'TAKER' | 'MAKER';
}

export interface PlaceOrderPayload {
  order: SignedOrder;
  owner: string;
  orderType: 'GTC' | 'GTD' | 'FOK';
}

export interface PlaceOrderResponse {
  success: boolean;
  orderID: string;
  status: ClobOrderStatus;
  transactionsHashes: string[];
  errorMsg?: string;
}

// ─── L2 auth headers ─────────────────────────────────────────────────────────

async function buildAuthHeaders(
  method: string,
  path: string,
  body = '',
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.floor(Math.random() * 1e9);

  const signature = await signer.signL2AuthMessage(timestamp, method.toUpperCase(), path, body);

  return {
    'POLY_ADDRESS':    signer.getAddress(),
    'POLY_SIGNATURE':  signature,
    'POLY_TIMESTAMP':  String(timestamp),
    'POLY_NONCE':      String(nonce),
    'POLY_API_KEY':    config.POLYMARKET_API_KEY,
  };
}

// ─── CLOB Client ──────────────────────────────────────────────────────────────

class ClobClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.POLYMARKET_API_BASE,
      timeout: 20_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Order placement ──────────────────────────────────────────────────────────

  async placeOrder(
    signedOrder: SignedOrder,
    orderType: 'GTC' | 'GTD' | 'FOK' = 'GTC',
  ): Promise<PlaceOrderResponse> {
    const path = '/order';
    const payload: PlaceOrderPayload = {
      order: signedOrder,
      owner: signer.getAddress(),
      orderType,
    };
    const body = JSON.stringify(payload);
    const headers = await buildAuthHeaders('POST', path, body);

    return withRetry(async () => {
      const resp = await this.http.post<PlaceOrderResponse>(path, payload, { headers });
      logger.trade('Order submitted to CLOB', {
        orderId: resp.data.orderID,
        status: resp.data.status,
      });
      return resp.data;
    });
  }

  // ── Order cancellation ───────────────────────────────────────────────────────

  async cancelOrder(orderId: string): Promise<boolean> {
    const path = `/order/${orderId}`;
    const headers = await buildAuthHeaders('DELETE', path);

    return withRetry(async () => {
      await this.http.delete(path, { headers });
      logger.info('Order cancelled', { orderId });
      return true;
    }).catch((err) => {
      logger.warn('Failed to cancel order', { orderId, error: (err as Error).message });
      return false;
    });
  }

  async cancelAllOrders(): Promise<boolean> {
    const path = '/cancel-all';
    const headers = await buildAuthHeaders('DELETE', path);

    return withRetry(async () => {
      await this.http.delete(path, { headers });
      logger.info('All open orders cancelled');
      return true;
    }).catch((err) => {
      logger.error('Failed to cancel all orders', { error: (err as Error).message });
      return false;
    });
  }

  // ── Order queries (no auth required) ────────────────────────────────────────

  async getOrder(orderId: string): Promise<ClobOrder | null> {
    return withRetry(async () => {
      const resp = await this.http.get<ClobOrder>(`/order/${orderId}`);
      return resp.data;
    }).catch((err) => {
      logger.warn('Failed to fetch order', { orderId, error: (err as Error).message });
      return null;
    });
  }

  async getOpenOrders(marketId?: string): Promise<ClobOrder[]> {
    return withRetry(async () => {
      const params: Record<string, string> = {
        maker_address: signer.getAddress(),
        status: 'LIVE',
      };
      if (marketId) params['market'] = marketId;

      const resp = await this.http.get<{ data: ClobOrder[] }>('/orders', { params });
      return resp.data.data ?? [];
    }).catch((err) => {
      logger.warn('Failed to fetch open orders', { error: (err as Error).message });
      return [];
    });
  }

  async getOrderFills(orderId: string): Promise<ClobTrade[]> {
    return withRetry(async () => {
      const resp = await this.http.get<ClobOrder>(`/order/${orderId}`);
      return resp.data.associate_trades ?? [];
    }).catch(() => []);
  }

  // ── Health check ─────────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    try {
      await this.http.get('/markets', { params: { limit: 1 } });
      return true;
    } catch {
      return false;
    }
  }
}

export const clobClient = new ClobClient();
