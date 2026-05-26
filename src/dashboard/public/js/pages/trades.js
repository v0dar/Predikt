// ─── Page: Trades ─────────────────────────────────────────────────────────────

router.register('/trades', {
  title: 'Trades',
  template: () => `
    <div class="page-header">
      <h5 class="page-title">Trades</h5>
      <div class="d-flex gap-2 align-items-center flex-wrap">
        <select class="form-select form-select-sm" id="filter-mode" style="width:110px">
          <option value="">All modes</option>
          <option value="demo">Demo</option>
          <option value="live">Live</option>
        </select>
        <select class="form-select form-select-sm" id="filter-status" style="width:120px">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="filled">Filled</option>
          <option value="cancelled">Cancelled</option>
          <option value="resolved">Resolved</option>
        </select>
        <select class="form-select form-select-sm" id="filter-side" style="width:100px">
          <option value="">All sides</option>
          <option value="YES">YES</option>
          <option value="NO">NO</option>
        </select>
        <button class="btn btn-sm btn-outline-secondary" id="btn-export-trades">
          <i class="bi bi-download me-1"></i>Export
        </button>
      </div>
    </div>

    <!-- Summary row -->
    <div class="row g-3 mb-4" id="trades-summary-row">
      <div class="col-6 col-md-3">
        <div class="card data-card">
          <div class="stat-label">Total Trades</div>
          <div class="stat-value" id="ts-total">—</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card data-card">
          <div class="stat-label">Win Rate</div>
          <div class="stat-value" id="ts-winrate">—</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card data-card">
          <div class="stat-label">Total PnL</div>
          <div class="stat-value" id="ts-pnl">—</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card data-card">
          <div class="stat-label">Open Now</div>
          <div class="stat-value" id="ts-open">—</div>
        </div>
      </div>
    </div>

    <!-- Trade table -->
    <div class="card">
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
          <thead>
            <tr>
              <th>Market</th><th>Mode</th><th>Side</th>
              <th>Size</th><th>Price</th><th>EV</th>
              <th>Status</th><th>PnL</th><th>Placed</th>
            </tr>
          </thead>
          <tbody id="trades-body">
            <tr><td colspan="9" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div></td></tr>
          </tbody>
        </table>
      </div>
      <!-- Pagination -->
      <div class="d-flex justify-content-between align-items-center p-3 border-top" style="border-color:var(--border-primary)!important">
        <span class="text-muted small" id="trades-count">—</span>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" id="btn-prev-trades">
            <i class="bi bi-chevron-left"></i>
          </button>
          <button class="btn btn-sm btn-outline-secondary" id="btn-next-trades">
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>`,

  async init() {
    let page = 0;
    const PAGE_SIZE = 25;

    async function load() {
      const mode   = document.getElementById('filter-mode')?.value ?? '';
      const status = document.getElementById('filter-status')?.value ?? '';
      const side   = document.getElementById('filter-side')?.value ?? '';
      const sb = window._supabase;

      let q = sb.from('trades').select('*', { count: 'exact' });
      if (mode)   q = q.eq('mode', mode);
      if (status) q = q.eq('status', status);
      if (side)   q = q.eq('side', side);
      q = q.order('placed_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data: trades, count } = await q;
      renderTrades(trades ?? [], count ?? 0, page, PAGE_SIZE);
    }

    function renderTrades(trades, count, pg, ps) {
      const tbody = document.getElementById('trades-body');
      if (!tbody) return;

      if (!trades.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No trades match the filter</td></tr>';
        return;
      }

      tbody.innerHTML = trades.map(t => {
        const pnl = t.pnl != null ? app.pnlSpan(t.pnl) : '<span class="text-muted">—</span>';
        return `
          <tr class="fade-row">
            <td class="text-truncate" style="max-width:220px" title="${app.escHtml(t.market_question??'')}">
              ${app.escHtml((t.market_question ?? '—').slice(0, 55))}
            </td>
            <td><span class="badge bg-secondary">${t.mode ?? '—'}</span></td>
            <td>${app.fmtSide(t.side)}</td>
            <td>$${Number(t.size).toFixed(2)}</td>
            <td>${Number(t.price).toFixed(3)}</td>
            <td class="text-muted small">${t.ev != null ? (Number(t.ev)*100).toFixed(1)+'%' : '—'}</td>
            <td>${app.statusBadge(t.status)}</td>
            <td>${pnl}</td>
            <td class="text-muted small">${app.timeAgo(t.placed_at)}</td>
          </tr>`;
      }).join('');

      app.setText('trades-count', `${pg * ps + 1}–${Math.min((pg + 1) * ps, count)} of ${count}`);
      document.getElementById('btn-prev-trades').disabled = pg === 0;
      document.getElementById('btn-next-trades').disabled = (pg + 1) * ps >= count;
    }

    async function loadSummary() {
      const sb = window._supabase;
      const { data: all } = await sb.from('trades').select('status,pnl,mode');
      if (!all) return;
      const total = all.length;
      const open  = all.filter(t => t.status === 'open').length;
      const won   = all.filter(t => t.pnl != null && t.pnl > 0).length;
      const closed = all.filter(t => t.pnl != null).length;
      const totalPnl = all.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);

      app.setText('ts-total', total);
      app.setText('ts-winrate', closed > 0 ? `${((won/closed)*100).toFixed(1)}%` : '—');
      document.getElementById('ts-pnl').innerHTML = app.pnlSpan(totalPnl);
      app.setText('ts-open', open);
    }

    ['filter-mode','filter-status','filter-side'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => { page = 0; load(); });
    });
    document.getElementById('btn-prev-trades')?.addEventListener('click', () => { if (page > 0) { page--; load(); } });
    document.getElementById('btn-next-trades')?.addEventListener('click', () => { page++; load(); });

    document.getElementById('btn-export-trades')?.addEventListener('click', async () => {
      try {
        const headers = await (async () => {
          const sb = window._supabase;
          const { data: { session } } = await sb.auth.getSession();
          return session ? { Authorization: `Bearer ${session.access_token}` } : {};
        })();
        const res = await fetch('/api/logs/download', { headers });
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `predikt-logs-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
      } catch (e) { app.showToast(e.message, 'danger'); }
    });

    await Promise.all([load(), loadSummary()]);

    window.onTradeChange = () => { page = 0; load(); loadSummary(); };

    return () => { window.onTradeChange = null; };
  },
});
