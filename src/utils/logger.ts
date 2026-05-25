import winston from 'winston';
import Transport from 'winston-transport';
import { insertBotLog } from '../db/queries.js';

// ─── Custom log levels ────────────────────────────────────────────────────────

const LEVELS = { error: 0, warn: 1, info: 2, trade: 3, audit: 4, debug: 5 } as const;
const COLORS = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  trade: 'cyan',
  audit: 'magenta',
  debug: 'white',
};

winston.addColors(COLORS);

// ─── Supabase transport — fire-and-forget, never crashes the bot ──────────────

type SupabaseLevel = 'info' | 'warn' | 'error' | 'debug' | 'trade' | 'audit';

class SupabaseTransport extends Transport {
  constructor(opts?: Transport.TransportStreamOptions) {
    super(opts);
  }

  override log(info: Record<string, unknown>, callback: () => void): void {
    const level = String(info['level'] ?? 'info') as SupabaseLevel;
    const message = String(info['message'] ?? '');

    const meta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(info)) {
      if (k !== 'level' && k !== 'message') meta[k] = v;
    }

    void insertBotLog({ level, message, meta: Object.keys(meta).length ? meta : null }).catch(
      () => {
        // Intentionally silent — logging must never crash the bot
      },
    );

    callback();
  }
}

// ─── Format helpers ───────────────────────────────────────────────────────────

const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
    const prefix = correlationId ? ` [${String(correlationId)}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${String(timestamp)} ${level}${prefix}: ${String(message)}${metaStr}`;
  }),
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// ─── Logger singleton ─────────────────────────────────────────────────────────

const isDev = process.env['NODE_ENV'] !== 'production';
const logLevel = process.env['LOG_LEVEL'] ?? 'info';

const baseLogger = winston.createLogger({
  levels: LEVELS,
  level: logLevel,
  transports: [
    new winston.transports.Console({
      format: isDev ? devFormat : prodFormat,
    }),
    new SupabaseTransport({
      level: 'trade', // send trade and above (error, warn, info, trade) to Supabase
    }),
  ],
  exitOnError: false,
});

// ─── Type augmentation for custom levels ──────────────────────────────────────

declare module 'winston' {
  interface Logger {
    trade: winston.LeveledLogMethod;
    audit: winston.LeveledLogMethod;
  }
}

export const logger = baseLogger;

// ─── Correlated logger factory ────────────────────────────────────────────────
// Creates a child logger that stamps every entry with a correlationId.
// Use this inside a single scan cycle or trade execution flow for tracing.

export function createCorrelatedLogger(correlationId: string): winston.Logger {
  return logger.child({ correlationId });
}
