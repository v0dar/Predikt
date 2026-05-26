// ─── Page: Backtesting ───────────────────────────────────────────────────────

router.register('/backtesting', {
  title: 'Backtesting',
  template: () => `
    <div class="page-header">
      <h5 class="page-title">Backtesting</h5>
    </div>

    <div class="row g-3">
      <!-- Config panel -->
      <div class="col-lg-4">
        <div class="card">
          <div class="card-header-label mb-3">Run Configuration</div>
          <form id="backtest-form">
            <div class="mb-3">
              <label class="form-label">Strategy</label>
              <select class="form-select form-select-sm" id="bt-strategy">
                <option value="value-bet">Value Bet</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label">Date From</label>
              <input type="date" class="form-control form-control-sm" id="bt-from">
            </div>
            <div class="mb-3">
              <label class="form-label">Date To</label>
              <input type="date" class="form-control form-control-sm" id="bt-to">
            </div>
            <div class="mb-3">
              <label class="form-label">Starting Balance (USDC)</label>
              <input type="number" class="form-control form-control-sm" id="bt-balance" value="500" min="10">
            </div>
            <div class="mb-4">
              <label class="form-label">Min Edge %</label>
              <input type="number" class="form-control form-control-sm" id="bt-edge" value="5" min="1" max="50">
            </div>
            <button type="submit" class="btn btn-primary w-100">
              <span id="bt-spinner" class="spinner-border spinner-border-sm me-2 d-none"></span>
              Run Backtest
            </button>
          </form>
        </div>

        <!-- Previous runs -->
        <div class="card mt-3">
          <div class="card-header-label mb-3">Previous Runs</div>
          <div id="bt-runs-list" class="d-flex flex-column gap-2">
            <div class="text-muted small">Loading…</div>
          </div>
        </div>
      </div>

      <!-- Results panel -->
      <div class="col-lg-8">
        <div id="bt-results" class="d-flex flex-column gap-3">
          <div class="card" style="min-height:300px;display:flex;align-items:center;justify-content:center">
            <div class="text-center text-muted">
              <i class="bi bi-play-circle" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:8px"></i>
              Configure and run a backtest to see results
            </div>
          </div>
        </div>
      </div>
    </div>`,

  async init() {
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const fromEl = document.getElementById('bt-from');
    const toEl = document.getElementById('bt-to');
    if (fromEl) fromEl.value = monthAgo;
    if (toEl) toEl.value = today;

    await loadPreviousRuns();

    document.getElementById('backtest-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const spinner = document.getElementById('bt-spinner');
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      spinner.classList.remove('d-none');

      try {
        const res = await app.apiPost('/backtest/run', {
          strategy: document.getElementById('bt-strategy').value,
          dateFrom: document.getElementById('bt-from').value,
          dateTo:   document.getElementById('bt-to').value,
          startingBalance: parseFloat(document.getElementById('bt-balance').value),
          minEdge: parseFloat(document.getElementById('bt-edge').value),
        });

        if (res.error) {
          app.showToast(res.error, 'danger');
        } else {
          renderResults(res);
          loadPreviousRuns();
        }
      } catch (e) {
        // Phase 12 not implemented yet
        showNotImplemented();
      } finally {
        btn.disabled = false;
        spinner.classList.add('d-none');
      }
    });

    function showNotImplemented() {
      document.getElementById('bt-results').innerHTML = `
        <div class="card">
          <div class="text-center py-4">
            <i class="bi bi-cone" style="font-size:2rem;color:var(--accent-warning);display:block;margin-bottom:8px"></i>
            <div class="fw-500">Backtesting engine coming in Phase 12</div>
            <div class="text-muted small mt-1">Market snapshots are already being recorded on every scan cycle</div>
          </div>
        </div>`;
    }

    function renderResults(run) {
      const chartId = 'bt-equity-chart';
      document.getElementById('bt-results').innerHTML = `
        <div class="row g-3">
          <div class="col-6 col-md-3"><div class="card data-card"><div class="stat-label">ROI</div><div class="stat-value">${app.fmtPct(run.roi_percent)}</div></div></div>
          <div class="col-6 col-md-3"><div class="card data-card"><div class="stat-label">Win Rate</div><div class="stat-value">${app.fmtPct(run.win_rate)}</div></div></div>
          <div class="col-6 col-md-3"><div class="card data-card"><div class="stat-label">Sharpe</div><div class="stat-value">${run.sharpe_ratio?.toFixed(2) ?? '—'}</div></div></div>
          <div class="col-6 col-md-3"><div class="card data-card"><div class="stat-label">Max DD</div><div class="stat-value">${app.fmtPct(run.max_drawdown)}</div></div></div>
        </div>
        <div class="card">
          <div class="card-header-label mb-3">Equity Curve</div>
          <div style="height:220px"><canvas id="${chartId}"></canvas></div>
        </div>`;

      const c = charts.createBacktestEquityChart(chartId);
      if (c && run.equity_curve) {
        c.data.labels = run.equity_curve.map(p => p.date);
        c.data.datasets[0].data = run.equity_curve.map(p => p.balance);
        c.update();
        window._activeCharts = [c];
      }
    }

    async function loadPreviousRuns() {
      const sb = window._supabase;
      const { data } = await sb.from('backtest_runs').select('*').order('created_at', { ascending: false }).limit(5);
      const list = document.getElementById('bt-runs-list');
      if (!list) return;
      if (!data?.length) {
        list.innerHTML = '<div class="text-muted small">No runs yet</div>';
        return;
      }
      list.innerHTML = data.map(r => `
        <div class="card" style="padding:12px;cursor:pointer" onclick="">
          <div class="d-flex justify-content-between">
            <span class="small fw-500">${r.strategy_name ?? 'value-bet'}</span>
            <span class="text-muted" style="font-size:0.7rem">${new Date(r.created_at).toLocaleDateString()}</span>
          </div>
          <div class="d-flex gap-3 mt-1">
            <span class="small" style="color:var(--accent-success)">ROI: ${app.fmtPct(r.roi_percent)}</span>
            <span class="small text-muted">WR: ${app.fmtPct(r.win_rate)}</span>
            <span class="small text-muted">${r.total_trades ?? 0} trades</span>
          </div>
        </div>`).join('');
    }
  },
});
