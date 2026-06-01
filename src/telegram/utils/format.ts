import { escMd } from './escape.js';

// ─── Inline primitives ────────────────────────────────────────────────────────

export const bold  = (s: string) => `*${s}*`;
export const mono  = (s: string) => `\`${s}\``;
export const code  = (s: string) => `\`\`\`\n${s}\n\`\`\``;
export const italic = (s: string) => `_${s}_`;

// ─── Structured line ──────────────────────────────────────────────────────────

export function line(label: string, value: string | number | null | undefined): string {
  return `${bold(escMd(label))}: ${escMd(value)}`;
}

// ─── Section block ────────────────────────────────────────────────────────────

export function section(title: string, rows: string[]): string {
  return [`*${escMd(title)}*`, ...rows].join('\n');
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export const divider = '─────────────────────';

// ─── Number formatters ────────────────────────────────────────────────────────

export function fmtUsd(v: number | null | undefined): string {
  if (v == null || isNaN(Number(v))) return '—';
  const n = Number(v);
  return `${n >= 0 ? '+' : ''}$${Math.abs(n).toFixed(2)}`;
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(Number(v))) return '—';
  return `${Number(v).toFixed(1)}%`;
}

export function fmtBalance(v: number | null | undefined): string {
  if (v == null) return '—';
  return `$${Number(v).toFixed(2)}`;
}

export function fmtPrice(v: number | null | undefined): string {
  if (v == null) return '—';
  return Number(v).toFixed(3);
}

// ─── Time formatter ───────────────────────────────────────────────────────────

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 0) {
    const s = Math.abs(d);
    if (s < 60) return `in ${s}s`;
    if (s < 3600) return `in ${Math.floor(s / 60)}m`;
    return `in ${Math.floor(s / 3600)}h`;
  }
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Status indicator ─────────────────────────────────────────────────────────

export function stateEmoji(state: string): string {
  const map: Record<string, string> = {
    READY:                '🟢',
    SCANNING:             '🔍',
    PLACING_ORDER:        '📤',
    WAITING_CONFIRMATION: '⏳',
    PAUSED:               '⏸',
    ERROR_RECOVERY:       '🔧',
    EMERGENCY_STOPPED:    '🛑',
    BOOTING:              '🔄',
    SYNCING:              '🔄',
    SHUTTING_DOWN:        '⬇️',
  };
  return map[state] ?? '❓';
}

export function healthEmoji(s: string): string {
  return s === 'ok' ? '✅' : '❌';
}

export function priorityEmoji(p: string): string {
  const m: Record<string, string> = { INFO: 'ℹ️', WARNING: '⚠️', CRITICAL: '🔴', FATAL: '💀' };
  return m[p] ?? 'ℹ️';
}
