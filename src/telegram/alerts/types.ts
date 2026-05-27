export type AlertPriority = 'INFO' | 'WARNING' | 'CRITICAL' | 'FATAL';

export interface Alert {
  priority:  AlertPriority;
  title:     string;
  body:      string;
  timestamp: Date;
}

export interface AlertThrottle {
  windowMs:    number;  // throttle window
  maxPerWindow: number; // max alerts per window
}

export const ALERT_THROTTLES: Record<AlertPriority, AlertThrottle> = {
  INFO:     { windowMs: 60_000, maxPerWindow: 3 },
  WARNING:  { windowMs: 30_000, maxPerWindow: 5 },
  CRITICAL: { windowMs: 10_000, maxPerWindow: 10 },
  FATAL:    { windowMs: 0,      maxPerWindow: Infinity }, // never throttle
};

export const ALERT_EMOJIS: Record<AlertPriority, string> = {
  INFO:     'ℹ️',
  WARNING:  '⚠️',
  CRITICAL: '🔴',
  FATAL:    '💀',
};
