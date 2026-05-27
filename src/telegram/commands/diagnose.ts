import type { BotContext } from '../types/index.js';
import { adminApi } from '../services/admin-api.js';
import { escMd, bold, divider } from '../utils/index.js';

function check(val: unknown): string {
  if (val === 'ok') return '✅';
  if (typeof val === 'string' && val.startsWith('error')) return '❌';
  if (typeof val === 'string' && (val.includes('401') || val.includes('403'))) return '❌';
  return '✅';
}

function addr(val: unknown): string {
  if (!val) return escMd('not set');
  const s = String(val);
  return escMd(`${s.slice(0, 6)}…${s.slice(-4)}`);
}

export async function diagnoseCommand(ctx: BotContext): Promise<void> {
  await ctx.reply('🔍 Running diagnostics…');

  const d = await adminApi.getDiagnose();

  const privOk  = check(d['private_key']);
  const rpcOk   = check(d['rpc']);
  const clobOk  = check(d['clob_connectivity']);
  const apiOk   = check(d['api_key']);
  const proxyOk = d['proxy_set'] ? '✅' : '⚠️';

  const usdcVal  = d['usdc']  != null ? `\\$${escMd(Number(d['usdc']).toFixed(2))}` : '—';
  const maticVal = d['matic'] != null ? escMd(Number(d['matic']).toFixed(4)) : '—';

  const apiStatus = d['api_key'] === 'ok'
    ? 'valid'
    : escMd(String(d['api_key'] ?? 'unknown'));

  const text = [
    `🔬 ${bold('Polymarket Diagnostics')}`,
    escMd(divider),
    `${privOk} ${bold('Private Key')} → wallet ${addr(d['wallet_address'])}`,
    `${rpcOk} ${bold('RPC')} → USDC: ${usdcVal} · MATIC: ${maticVal}`,
    `${proxyOk} ${bold('Proxy Address')} → ${addr(d['proxy_address'])}`,
    `${clobOk} ${bold('CLOB Connectivity')} → ${escMd(String(d['clob_connectivity'] ?? '—'))}`,
    `${apiOk} ${bold('API Key')} → ${apiStatus}`,
    '',
    d['private_key'] !== 'ok'
      ? `⚠️ _${escMd('PRIVATE\\_KEY invalid or missing')}_`
      : d['api_key'] !== 'ok'
      ? `⚠️ _${escMd('Check POLYMARKET\\_API\\_KEY in \\.env')}_`
      : `_All systems ready for live trading_`,
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'MarkdownV2' });
}
