// ─── Page: Overview ───────────────────────────────────────────────────────────

router.register('/', {
  title: 'Overview',

  template: () => `
    <div class="page-header">
      <h5 class="page-title">Overview</h5>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-sm btn-outline-secondary" id="btn-scan">
          <i class="bi bi-arrow-repeat me-1"></i>Scan Now
        </button>
        <button class="btn btn-sm btn-warning" id="btn-pause">
          <i class="bi bi-pause-fill me-1"></i>Pause
        </button>
        <button class="btn btn-sm btn-success d-none" id="btn-resume">
          <i class="bi bi-play-fill me-1"></i>Resume
        </button>
        <button class="btn btn-sm btn-danger" id="btn-estop">
          <i class="bi bi-stop-fill me-1"></i>Emergency Stop
        </button>
      </div>
    </div>

    <!-- Stat cards -->
    <div class="row g-3 mb-4">
      <div class="col-6 col-xl-3">
        <div class="card data-card">
          <div class="stat-label">USDC Balance</div>
          <div class="stat-value" id="stat-balance">—</div>
        </div>
      </div>
      <div class="col-6 col-xl-3">
        <div class="card data-card">
          <div class="stat-label">Open Positions</div>
          <div class="stat-value" id="stat-positions">—</div>
        </div>
      </div>
      <div class="col-6 col-xl-3">
        <div class="card data-card">
          <div class="stat-label">Bot State</div>
          <div class="stat-value" id="stat-state">—</div>
        </div>
      </div>
      <div class="col-6 col-xl-3">
        <div class="card data-card">
          <div class="stat-label">Regime</div>
          <div class="stat-value" id="stat-regime">—</div>
        </div>
      </div>
    </div>

    <!-- Today + Onboarding -->
    <div class="row g-3 mb-4">
      <div class="col-lg-6">
        <div class="card">
          <div class="card-header-label">Today's Summary</div>
          <table class="table table-sm mb-0 mt-2">
            <tbody>
              <tr><td class="text-muted small">Trades placed</td><td id="today-trades">—</td></tr>
              <tr><td class="text-muted small">Won</td><td id="today-won">—</td></tr>
              <tr><td class="text-muted small">Lost</td><td id="today-lost">—</td></tr>
              <tr><td class="text-muted small">Net PnL</td><td id="today-pnl">—</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card">
          <div class="card-header-label">Onboarding Progress</div>
          <div id="onboarding-content" class="mt-2">
            <div class="skeleton-line" style="width:80%"></div>
            <div class="skeleton-line mt-2" style="width:60%"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent trades -->
    <div class="card">
      <div class="card-header-label">Recent Trades</div>
      <div class="table-responsive mt-2">
        <table class="table table-sm table-hover">
          <thead>
            <tr><th>Market</th><th>Side</th><th>Size</th><th>Price</th><th>Status</th><th>Placed</th></tr>
          </thead>
          <tbody id="recent-trades-body">
            <tr><td colspan="6" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Emergency stop confirm -->
    <div class="modal fade" id="estopModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content modal-dark">
          <div class="modal-header border-0">
            <h5 class="modal-title text-danger"><i class="bi bi-exclamation-triangle-fill me-2"></i>Emergency Stop</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body text-muted">
            Immediately cancels all open orders and halts the bot. This cannot be undone without a manual resume.
          </div>
          <div class="modal-footer border-0">
            <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-danger btn-sm" id="confirm-estop">Stop Everything</button>
          </div>
        </div>
      </div>
    </div>`,

  async init() {
    await loadStats();
    await loadTodaySummary();
    await loadOnboarding();
    await loadRecentTrades();
    wireHomeControls();

    // Live updates from realtime
    window.onStatusUpdate = (status) => {
      applyStats(status);
      syncBotButtons(status.state);
    };
    window.onTradeChange = () => loadRecentTrades();

    return () => {
      window.onStatusUpdate = null;
      window.onTradeChange = null;
    };
  },
});

async function loadStats() {
  const status = window._botStatus;
  if (status) applyStats(status);
}

function applyStats(status) {
  app.setText('stat-balance', status.usdc_balance != null ? `$${Number(status.usdc_balance).toFixed(2)}` : '—');
  app.setText('stat-positions', status.open_positions ?? '—');
  app.setText('stat-state', status.state ?? '—');
  app.setText('stat-regime', status.current_regime ?? '—');
  syncBotButtons(status.state);
}

function syncBotButtons(state) {
  document.getElementById('btn-pause')?.classList.toggle('d-none', state === 'PAUSED');
  document.getElementById('btn-resume')?.classList.toggle('d-none', state !== 'PAUSED');
}

async function loadTodaySummary() {
  try {
    const sb = window._supabase;
    const today = new Date().toISOString().slice(0, 10);
    const { data: snap } = await sb.from('pnl_snapshots').select('*').eq('date', today).maybeSingle();
    if (snap) {
      app.setText('today-trades', snap.trades_placed ?? 0);
      app.setText('today-won', snap.trades_won ?? 0);
      app.setText('today-lost', snap.trades_lost ?? 0);
      document.getElementById('today-pnl').innerHTML = app.pnlSpan(snap.net_pnl);
    } else {
      ['today-trades','today-won','today-lost'].forEach(id => app.setText(id, '0'));
      document.getElementById('today-pnl').innerHTML = app.pnlSpan(0);
    }
  } catch (e) { console.error(e); }
}

async function loadOnboarding() {
  try {
    const res = await fetch('/api/onboarding/checklist');
    const state = await res.json();
    const container = document.getElementById('onboarding-content');
    if (!container) return;

    const phaseLabels = {
      1: { label: 'Phase 1 — Demo', desc: '7 days · 10 trades · ≥50% win rate' },
      2: { label: 'Phase 2 — Micro Live', desc: '20 real trades · ≥45% win rate' },
      3: { label: 'Phase 3 — Full Live', desc: 'Scale gradually' },
    };
    const currentPhase = state.phase ?? 1;
    const pl = phaseLabels[currentPhase] ?? phaseLabels[1];

    const checklistHtml = (state.items ?? []).map(item => `
      <div class="d-flex align-items-center gap-2 py-1">
        <i class="bi ${item.done ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'}" style="font-size:0.85rem;flex-shrink:0"></i>
        <span class="small ${item.done ? 'text-muted' : ''}" style="flex:1">${app.escHtml(item.label)}</span>
        <span class="small fw-500" style="color:${item.done ? 'var(--accent-success)' : 'var(--text-muted)'}">${app.escHtml(item.value)}</span>
      </div>`).join('');

    const advanceBadge = state.canAdvance
      ? `<div class="mt-2 p-2 rounded small" style="background:rgba(30,215,96,0.1);color:var(--accent-success)">
           <i class="bi bi-lightning-fill me-1"></i>All conditions met — ready to advance!
         </div>`
      : '';

    container.innerHTML = `
      <div class="mb-2">
        <span class="fw-500 small">${app.escHtml(pl.label)}</span>
        <span class="text-muted ms-2" style="font-size:0.72rem">${app.escHtml(pl.desc)}</span>
      </div>
      ${checklistHtml}
      ${advanceBadge}`;
  } catch (e) { console.error(e); }
}

async function loadRecentTrades() {
  try {
    const sb = window._supabase;
    const { data: trades } = await sb.from('trades').select('*').order('placed_at', { ascending: false }).limit(10);
    const tbody = document.getElementById('recent-trades-body');
    if (!tbody) return;
    if (!trades?.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No trades yet</td></tr>';
      return;
    }
    tbody.innerHTML = trades.map(t => `
      <tr class="fade-row">
        <td class="text-truncate" style="max-width:180px" title="${app.escHtml(t.market_question ?? '')}">${app.escHtml((t.market_question ?? '—').slice(0, 45))}…</td>
        <td>${app.fmtSide(t.side)}</td>
        <td>$${Number(t.size).toFixed(2)}</td>
        <td>${Number(t.price).toFixed(3)}</td>
        <td>${app.statusBadge(t.status)}</td>
        <td class="text-muted small">${app.timeAgo(t.placed_at)}</td>
      </tr>`).join('');
  } catch (e) { console.error(e); }
}

function wireHomeControls() {
  document.getElementById('btn-scan')?.addEventListener('click', async () => {
    try { await app.apiPost('/bot/scan'); app.showToast('Scan triggered'); }
    catch (e) { app.showToast(e.message, 'danger'); }
  });
  document.getElementById('btn-pause')?.addEventListener('click', async () => {
    try { await app.apiPost('/bot/pause'); app.showToast('Bot paused', 'warning'); }
    catch (e) { app.showToast(e.message, 'danger'); }
  });
  document.getElementById('btn-resume')?.addEventListener('click', async () => {
    try { await app.apiPost('/bot/resume'); app.showToast('Bot resumed'); }
    catch (e) { app.showToast(e.message, 'danger'); }
  });
  document.getElementById('btn-estop')?.addEventListener('click', () => {
    new bootstrap.Modal(document.getElementById('estopModal')).show();
  });
  document.getElementById('confirm-estop')?.addEventListener('click', async () => {
    try {
      await app.apiPost('/bot/emergency-stop');
      bootstrap.Modal.getInstance(document.getElementById('estopModal'))?.hide();
      app.showToast('Emergency stop triggered', 'danger');
    } catch (e) { app.showToast(e.message, 'danger'); }
  });
}
