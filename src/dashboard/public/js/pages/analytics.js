// ─── Page: Analytics ─────────────────────────────────────────────────────────

router.register('/analytics', {
  title: 'Analytics',
  template: () => `
    <div class="page-header">
      <h5 class="page-title">Analytics</h5>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-secondary active" id="mode-demo">Demo</button>
        <button class="btn btn-sm btn-outline-secondary" id="mode-live">Live</button>
      </div>
    </div>

    <!-- KPI row -->
    <div class="row g-3 mb-4" id="analytics-kpi">
      <div class="col-6 col-xl-3">
        <div class="card data-card">
          <div class="stat-label">Total PnL</div>
          <div class="stat-value" id="kpi-pnl">—</div>
        </div>
      </div>
      <div class="col-6 col-xl-3">
        <div class="card data-card">
          <div class="stat-label">Win Rate</div>
          <div class="stat-value" id="kpi-wr">—</div>
        </div>
      </div>
      <div class="col-6 col-xl-3">
        <div class="card data-card">
          <div class="stat-label">Total Trades</div>
          <div class="stat-value" id="kpi-trades">—</div>
        </div>
      </div>
      <div class="col-6 col-xl-3">
        <div class="card data-card">
          <div class="stat-label">Best Day</div>
          <div class="stat-value" id="kpi-best">—</div>
        </div>
      </div>
    </div>

    <!-- Charts row 1 -->
    <div class="row g-3 mb-3">
      <div class="col-lg-8">
        <div class="card">
          <div class="card-header-label mb-3">Equity Curve</div>
          <div style="height:220px"><canvas id="chart-equity"></canvas></div>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="card">
          <div class="card-header-label mb-3">Market Categories</div>
          <div style="height:220px"><canvas id="chart-category"></canvas></div>
        </div>
      </div>
    </div>

    <!-- Charts row 2 -->
    <div class="row g-3">
      <div class="col-lg-6">
        <div class="card">
          <div class="card-header-label mb-3">Daily PnL</div>
          <div style="height:180px"><canvas id="chart-daily-pnl"></canvas></div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card">
          <div class="card-header-label mb-3">Win Rate Over Time</div>
          <div style="height:180px"><canvas id="chart-win-rate"></canvas></div>
        </div>
      </div>
    </div>`,

  async init() {
    let currentMode = 'demo';
    let chartInstances = [];

    async function loadAnalytics(mode) {
      currentMode = mode;
      const sb = window._supabase;

      // PnL snapshots (mode-based table)
      const { data: snaps } = await sb
        .from('pnl_snapshots')
        .select('*')
        .eq('mode', mode)
        .order('date', { ascending: true })
        .limit(90);

      const snapData = snaps ?? [];

      // KPIs
      const totalPnl = snapData.reduce((s, r) => s + (parseFloat(r.net_pnl) || 0), 0);
      const won  = snapData.reduce((s, r) => s + (r.trades_won  ?? 0), 0);
      const lost = snapData.reduce((s, r) => s + (r.trades_lost ?? 0), 0);
      const totalTrades = won + lost;
      const wr = totalTrades > 0 ? ((won / totalTrades) * 100).toFixed(1) : '—';
      const bestDay = snapData.reduce((best, r) => Math.max(best, parseFloat(r.net_pnl) || 0), 0);

      document.getElementById('kpi-pnl').innerHTML = app.pnlSpan(totalPnl);
      app.setText('kpi-wr', totalTrades > 0 ? `${wr}%` : '—');
      app.setText('kpi-trades', totalTrades || '—');
      document.getElementById('kpi-best').innerHTML = bestDay > 0 ? app.pnlSpan(bestDay) : '<span class="text-muted">—</span>';

      // Destroy old charts
      chartInstances.forEach(c => { try { c.destroy(); } catch {} });
      chartInstances = [];

      // Equity chart
      const eq = charts.createEquityChart('chart-equity');
      if (eq) { charts.updateEquityChart(eq, snapData); chartInstances.push(eq); }

      // Daily PnL
      const dp = charts.createDailyPnlChart('chart-daily-pnl');
      if (dp) { charts.updateDailyPnlChart(dp, snapData); chartInstances.push(dp); }

      // Win rate
      const wr2 = charts.createWinRateChart('chart-win-rate');
      if (wr2) { charts.updateWinRateChart(wr2, snapData); chartInstances.push(wr2); }

      // Category chart — from trades table
      const { data: tradeData } = await sb.from('trades').select('market_id').eq('mode', mode);
      const { data: marketData } = await sb.from('markets').select('id,category');
      if (tradeData && marketData) {
        const catMap = {};
        const mktLookup = Object.fromEntries(marketData.map(m => [m.id, m.category ?? 'Other']));
        tradeData.forEach(t => {
          const cat = mktLookup[t.market_id] ?? 'Other';
          catMap[cat] = (catMap[cat] ?? 0) + 1;
        });
        const cc = charts.createCategoryChart('chart-category');
        if (cc) { charts.updateCategoryChart(cc, catMap); chartInstances.push(cc); }
      }

      window._activeCharts = chartInstances;
    }

    document.getElementById('mode-demo')?.addEventListener('click', e => {
      document.getElementById('mode-demo').classList.add('active');
      document.getElementById('mode-live').classList.remove('active');
      loadAnalytics('demo');
    });
    document.getElementById('mode-live')?.addEventListener('click', e => {
      document.getElementById('mode-live').classList.add('active');
      document.getElementById('mode-demo').classList.remove('active');
      loadAnalytics('live');
    });

    await loadAnalytics('demo');

    return () => {
      chartInstances.forEach(c => { try { c.destroy(); } catch {} });
      window._activeCharts = [];
    };
  },
});
