import 'dotenv/config';
import { z } from 'zod';
import { getAllSettings as dbGetAllSettings, getSetting } from '../db/queries.js';
import type { BotSettings } from '../db/types.js';

// ─── Zod schema — validates ALL env vars at startup ──────────────────────────
// Required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Everything else has sensible defaults for demo mode.

const envSchema = z.object({
  // Supabase — required
  SUPABASE_URL: z.string().url('must be a valid URL (e.g. https://xxxx.supabase.co)'),
  SUPABASE_ANON_KEY: z.string().min(10, 'must be a valid anon key'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10, 'must be a valid service role key'),

  // Dashboard
  DASHBOARD_PORT: z.coerce.number().int().positive().default(3003),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'trade', 'audit', 'debug']).default('info'),

  // Polymarket (not required in demo mode)
  POLYMARKET_API_BASE: z.string().url().default('https://clob.polymarket.com'),
  POLYMARKET_API_KEY: z.string().default(''),
  POLYMARKET_PROXY_ADDRESS: z.string().default(''),

  // Wallet (not required in demo mode)
  PRIVATE_KEY: z.string().default(''),

  // Chain
  RPC_URL: z.string().url().default('https://polygon-rpc.com'),
  CHAIN_ID: z.coerce.number().int().positive().default(137),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  LOCK_TTL_MS: z.coerce.number().int().positive().default(30000),

  // Telegram — notification alerts (optional)
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_CHAT_ID:   z.string().default(''),

  // Telegram — operational bot access control
  // Comma-separated Telegram user IDs, e.g. "123456789,987654321"
  TELEGRAM_OWNER_IDS:  z.string().default(''),
  TELEGRAM_ADMIN_IDS:  z.string().default(''),
  TELEGRAM_VIEWER_IDS: z.string().default(''),

  // Telegram — internal API secret (shared between bot and Express)
  TELEGRAM_ADMIN_SECRET: z.string().default(''),

  // Internal API URL (Telegram bot → Express — same server)
  DASHBOARD_INTERNAL_URL: z.string().url().default('http://localhost:3003'),

  // Auth
  ADMIN_EMAIL: z.string().email().default('admin@predikt.local'),
  APP_URL: z.string().url().default('http://localhost:3003'),
});

export type Config = z.infer<typeof envSchema>;

// ─── Load and validate — throws on startup if any required var is missing ─────

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  • ${String(issue.path[0])}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `\n[Config] Environment variable validation failed:\n${errors}\n\n` +
        `  → Copy .env.example to .env and fill in the required values.\n`,
    );
  }

  return result.data;
}

export const config: Config = loadConfig();

// ─── Live settings (hot-reloadable from Supabase) ────────────────────────────
// These read from the `settings` table so the user can change them at runtime
// without restarting the bot. Call these inside cron jobs / scan cycles.

export async function getAllSettings(): Promise<BotSettings> {
  return dbGetAllSettings();
}

export { getSetting };
