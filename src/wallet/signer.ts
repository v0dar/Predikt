import { ethers } from 'ethers';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { fromMicroUsdc } from '../utils/math.js';

// ─── Constants ────────────────────────────────────────────────────────────────

// USDC.e on Polygon (Polymarket uses this, 6 decimals)
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Polymarket CTF Exchange contract (Polygon mainnet)
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982e';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

interface IERC20 {
  balanceOf(address: string): Promise<bigint>;
  allowance(owner: string, spender: string): Promise<bigint>;
  approve(spender: string, amount: bigint): Promise<ethers.TransactionResponse>;
  transfer(to: string, amount: bigint): Promise<ethers.TransactionResponse>;
}

// EIP-712 order signing types for Polymarket CTF Exchange
const ORDER_TYPES = {
  Order: [
    { name: 'salt',          type: 'uint256' },
    { name: 'maker',         type: 'address' },
    { name: 'signer',        type: 'address' },
    { name: 'taker',         type: 'address' },
    { name: 'tokenId',       type: 'uint256' },
    { name: 'makerAmount',   type: 'uint256' },
    { name: 'takerAmount',   type: 'uint256' },
    { name: 'expiration',    type: 'uint256' },
    { name: 'nonce',         type: 'uint256' },
    { name: 'feeRateBps',    type: 'uint256' },
    { name: 'side',          type: 'uint8'   },
    { name: 'signatureType', type: 'uint8'   },
  ],
};

const EIP712_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: config.CHAIN_ID,
  verifyingContract: CTF_EXCHANGE,
};

// ─── Order types ──────────────────────────────────────────────────────────────

export type OrderSide = 0 | 1; // 0 = BUY, 1 = SELL
export type SignatureType = 0 | 1 | 2; // 0 = EOA, 1 = POLY_PROXY, 2 = POLY_GNOSIS_SAFE

export interface UnsignedOrder {
  tokenId: string;      // outcome token ID
  makerAmount: bigint;  // USDC in micro-USDC (1e6)
  takerAmount: bigint;  // shares (1e6 scale)
  side: OrderSide;
  expiration?: number;  // unix timestamp, 0 = GTC
  feeRateBps?: number;
}

export interface SignedOrder {
  salt: bigint;
  maker: string;
  signer: string;
  taker: string;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  expiration: bigint;
  nonce: bigint;
  feeRateBps: bigint;
  side: OrderSide;
  signatureType: SignatureType;
  signature: string;
}

// ─── Signer singleton ─────────────────────────────────────────────────────────

class WalletSigner {
  private provider: ethers.JsonRpcProvider | null = null;
  private wallet: ethers.Wallet | null = null;
  private usdc: ethers.Contract | null = null;

  private getProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      this.provider = new ethers.JsonRpcProvider(config.RPC_URL);
    }
    return this.provider;
  }

  private getWallet(): ethers.Wallet {
    if (!this.wallet) {
      if (!config.PRIVATE_KEY) {
        throw new Error('PRIVATE_KEY is not set — required for live trading');
      }
      this.wallet = new ethers.Wallet(config.PRIVATE_KEY, this.getProvider());
    }
    return this.wallet;
  }

  private getUsdcContract(): IERC20 {
    if (!this.usdc) {
      this.usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, this.getProvider());
    }
    return this.usdc as unknown as IERC20;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  getAddress(): string {
    return this.getWallet().address;
  }

  async getUsdcBalance(): Promise<number> {
    try {
      const raw = await this.getUsdcContract().balanceOf(this.getAddress()) as bigint;
      return fromMicroUsdc(raw);
    } catch (err) {
      logger.warn('Failed to fetch USDC balance', { error: (err as Error).message });
      return 0;
    }
  }

  async getMaticBalance(): Promise<number> {
    try {
      const raw = await this.getProvider().getBalance(this.getAddress());
      return parseFloat(ethers.formatEther(raw));
    } catch (err) {
      logger.warn('Failed to fetch MATIC balance', { error: (err as Error).message });
      return 0;
    }
  }

  async getUsdcAllowance(): Promise<number> {
    try {
      const raw = await this.getUsdcContract().allowance(
        this.getAddress(),
        CTF_EXCHANGE,
      ) as bigint;
      return fromMicroUsdc(raw);
    } catch (err) {
      logger.warn('Failed to fetch USDC allowance', { error: (err as Error).message });
      return 0;
    }
  }

  async approveUsdc(amountUsd: number): Promise<string> {
    const wallet = this.getWallet();
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet) as unknown as IERC20;
    const amount = ethers.parseUnits(amountUsd.toFixed(6), 6);
    const tx = await usdc.approve(CTF_EXCHANGE, amount);
    logger.info('USDC approval submitted', { txHash: tx.hash, amountUsd });
    await tx.wait();
    return tx.hash;
  }

  async signOrder(order: UnsignedOrder): Promise<SignedOrder> {
    const wallet = this.getWallet();
    const address = wallet.address;

    const salt = BigInt(Math.floor(Math.random() * 1e15));
    const expiration = BigInt(order.expiration ?? 0);
    const nonce = BigInt(0);
    const feeRateBps = BigInt(order.feeRateBps ?? 0);

    const orderStruct = {
      salt,
      maker:         address,
      signer:        address,
      taker:         ethers.ZeroAddress,
      tokenId:       BigInt(order.tokenId),
      makerAmount:   order.makerAmount,
      takerAmount:   order.takerAmount,
      expiration,
      nonce,
      feeRateBps,
      side:          order.side,
      signatureType: 0 as SignatureType,
    };

    const signature = await wallet.signTypedData(EIP712_DOMAIN, ORDER_TYPES, orderStruct);

    return { ...orderStruct, signature };
  }

  async transferUsdc(toAddress: string, amountUsd: number): Promise<string> {
    const wallet = this.getWallet();
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet) as unknown as IERC20;
    const amount = ethers.parseUnits(amountUsd.toFixed(6), 6);
    const tx = await usdc.transfer(toAddress, amount);
    logger.info('USDC transfer submitted', { txHash: tx.hash, toAddress, amountUsd });
    await tx.wait();
    return tx.hash;
  }

  async signL2AuthMessage(timestamp: number, method: string, path: string, body = ''): Promise<string> {
    const wallet = this.getWallet();
    const message = `${timestamp}${method}${path}${body}`;
    return wallet.signMessage(message);
  }

  async logBalances(): Promise<void> {
    const [usdc, matic] = await Promise.all([this.getUsdcBalance(), this.getMaticBalance()]);
    logger.info('Wallet balances', {
      address: this.getAddress(),
      usdc: `$${usdc.toFixed(2)}`,
      matic: `${matic.toFixed(4)} MATIC`,
    });
  }
}

export const signer = new WalletSigner();
