// ─── Page: Markets ────────────────────────────────────────────────────────────

router.register('/markets', {
  title: 'Markets',
  template: () => `
    <div class="page-header">
      <h5 class="page-title">Markets</h5>
      <div class="d-flex gap-2">
        <input type="text" class="form-control form-control-sm" id="market-search" placeholder="Search markets…" style="width:220px">
      </div>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs mb-3" id="markets-tab">
      <li class="nav-item">
        <button class="nav-link active" data-mktab="opportunities">
          <i class="bi bi-lightning-fill me-1"></i>Opportunities
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" data-mktab="all">
          <i class="bi bi-globe2 me-1"></i>All Scanned
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" data-mktab="blacklist">
          <i class="bi bi-slash-circle me-1"></i>Blacklist
        </button>
      </li>
    </ul>

    <!-- Opportunities -->
    <div id="mktab-opportunities">
      <div class="row g-3" id="opportunities-grid">
        <div class="col-12 text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div></div>
      </div>
    </div>

    <!-- All markets -->
    <div id="mktab-all" class="d-none">
      <div class="card">
        <div class="table-responsive">
          <table class="table table-sm table-hover mb-0">
            <thead>
              <tr><th>Market</th><th>Category</th><th>Volume</th><th>Liquidity</th><th>Scanned</th></tr>
            </thead>
            <tbody id="all-markets-body">
              <tr><td colspan="5" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Blacklist -->
    <div id="mktab-blacklist" class="d-none">
      <div class="card">
        <div class="table-responsive">
          <table class="table table-sm table-hover mb-0">
            <thead>
              <tr><th>Market</th><th>Reason</th><th>Blacklisted</th><th></th></tr>
            </thead>
            <tbody id="blacklist-body">
              <tr><td colspan="4" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>`,

  async init() {
    let activeTab = 'opportunities';

    function switchTab(tab) {
      activeTab = tab;
      ['opportunities','all','blacklist'].forEach(t => {
        document.getElementById(`mktab-${t}`)?.classList.toggle('d-none', t !== tab);
      });
      document.querySelectorAll('[data-mktab]').forEach(b => {
        b.classList.toggle('active', b.dataset.mktab === tab);
      });
      if (tab === 'opportunities') loadOpportunities();
      if (tab === 'all') loadAllMarkets();
      if (tab === 'blacklist') loadBlacklist();
    }

    document.querySelectorAll('[data-mktab]').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.mktab));
    });

    let searchTimeout;
    document.getElementById('market-search')?.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        if (activeTab === 'all') loadAllMarkets();
        else if (activeTab === 'opportunities') loadOpportunities();
      }, 300);
    });

    async function loadOpportunities() {
      const grid = document.getElementById('opportunities-grid');
      if (!grid) return;
      const sb = window._supabase;
      const q = document.getElementById('market-search')?.value?.toLowerCase() ?? '';
      const nowIso = new Date().toISOString();
      const { data: markets } = await sb.from('markets').select('*')
        .gt('end_date', nowIso)
        .gt('liquidity_usd', 0)
        .order('liquidity_usd', { ascending: false })
        .limit(50);
      const filtered = (markets ?? []).filter(m => !q || (m.question ?? '').toLowerCase().includes(q));

      if (!filtered.length) {
        grid.innerHTML = '<div class="col-12 text-center text-muted py-4">No markets found</div>';
        return;
      }
      grid.innerHTML = filtered.map(m => `
        <div class="col-12 col-md-6 col-xl-4 fade-row">
          <div class="card h-100">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <span class="badge bg-secondary small">${m.category ?? 'General'}</span>
              ${m.end_date ? `<span class="text-muted" style="font-size:0.7rem">Ends ${new Date(m.end_date).toLocaleDateString()}</span>` : ''}
            </div>
            <div class="fw-500 mb-3" style="font-size:0.85rem;line-height:1.4">${app.escHtml(m.question ?? '')}</div>
            <div class="d-flex gap-3 mt-auto">
              <div>
                <div class="stat-label">Volume</div>
                <div class="small">$${Number(m.volume_usd ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <div class="stat-label">Liquidity</div>
                <div class="small">$${Number(m.liquidity_usd ?? 0).toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>`).join('');
    }

    async function loadAllMarkets() {
      const tbody = document.getElementById('all-markets-body');
      if (!tbody) return;
      const sb = window._supabase;
      const q = document.getElementById('market-search')?.value?.toLowerCase() ?? '';
      const nowIso = new Date().toISOString();
      const { data: markets } = await sb.from('markets').select('*')
        .gt('end_date', nowIso)
        .order('last_scanned_at', { ascending: false })
        .limit(200);
      const filtered = (markets ?? []).filter(m => !q || (m.question ?? '').toLowerCase().includes(q));
      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No markets</td></tr>';
        return;
      }
      tbody.innerHTML = filtered.map(m => `
        <tr class="fade-row">
          <td class="text-truncate" style="max-width:280px">${app.escHtml(m.question ?? '—')}</td>
          <td class="text-muted small">${m.category ?? '—'}</td>
          <td class="small">$${Number(m.volume_usd ?? 0).toLocaleString()}</td>
          <td class="small">$${Number(m.liquidity_usd ?? 0).toLocaleString()}</td>
          <td class="text-muted small">${app.timeAgo(m.last_scanned_at)}</td>
        </tr>`).join('');
    }

    async function loadBlacklist() {
      const tbody = document.getElementById('blacklist-body');
      if (!tbody) return;
      const sb = window._supabase;
      const { data } = await sb.from('blacklisted_markets').select('*').order('blacklisted_at', { ascending: false });
      if (!data?.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No blacklisted markets</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(m => `
        <tr class="fade-row">
          <td class="text-truncate" style="max-width:260px">${app.escHtml(m.market_question ?? m.market_id ?? '—')}</td>
          <td class="text-muted small">${app.escHtml(m.reason ?? '—')}</td>
          <td class="text-muted small">${app.fmtDate(m.blacklisted_at)}</td>
          <td>
            <button class="btn btn-xs btn-outline-danger btn-sm" style="font-size:0.7rem;padding:2px 8px" data-remove="${m.market_id}">Remove</button>
          </td>
        </tr>`).join('');

      document.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.remove;
          const sb = window._supabase;
          await sb.from('blacklisted_markets').delete().eq('market_id', id);
          app.showToast('Removed from blacklist');
          loadBlacklist();
        });
      });
    }

    await loadOpportunities();
  },
});
