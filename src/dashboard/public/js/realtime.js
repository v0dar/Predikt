// ─── Predikt Dashboard — realtime.js ─────────────────────────────────────────
// Supabase Realtime — live updates to UI without any page refresh.
// All subscriptions are persistent for the lifetime of the shell.

'use strict';

const _channels = [];

async function initRealtime() {
  const sb = window._supabase;
  if (!sb) return;

  // ── bot_status — updates both sidebars + any page listener ─────────────────
  _channels.push(
    sb.channel('rt:bot_status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_status' }, p => {
        app.updateStatusWidgets(p.new);
      })
      .subscribe()
  );

  // ── bot_logs — activity feed + page listener (logs page) ───────────────────
  _channels.push(
    sb.channel('rt:bot_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_logs' }, p => {
        const row = p.new;
        const level = { error: 'error', warn: 'warn', trade: 'trade' }[row.level] ?? 'info';
        app.pushActivity(row.message, level);
        if (row.level === 'error' || row.level === 'warn') {
          app.pushAlert(`[${row.level.toUpperCase()}] ${row.message}`, level);
        }
        if (typeof window.onLogInsert === 'function') window.onLogInsert(row);
      })
      .subscribe()
  );

  // ── trades — page listeners ─────────────────────────────────────────────────
  _channels.push(
    sb.channel('rt:trades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, p => {
        if (typeof window.onTradeChange === 'function') window.onTradeChange(p);
        // Push to activity
        if (p.eventType === 'INSERT') {
          const t = p.new;
          app.pushActivity(`New trade: ${t.side} ${t.market_question?.slice(0,40) ?? ''}`, 'trade');
        }
      })
      .subscribe()
  );

  // ── demo_trades ─────────────────────────────────────────────────────────────
  _channels.push(
    sb.channel('rt:demo_trades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'demo_trades' }, p => {
        if (typeof window.onTradeChange === 'function') window.onTradeChange(p);
        if (p.eventType === 'INSERT') {
          const t = p.new;
          app.pushActivity(`Demo trade: ${t.side} ${t.market_question?.slice(0,40) ?? ''}`, 'trade');
        }
      })
      .subscribe()
  );

  // ── settings ─────────────────────────────────────────────────────────────────
  _channels.push(
    sb.channel('rt:settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, p => {
        if (typeof window.onSettingsChange === 'function') window.onSettingsChange(p);
      })
      .subscribe()
  );
}

window.initRealtime = initRealtime;
