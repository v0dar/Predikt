// ─── Page: Logs ───────────────────────────────────────────────────────────────

router.register('/logs', {
  title: 'Logs',
  template: () => `
    <div class="page-header">
      <h5 class="page-title">Logs</h5>
      <div class="d-flex gap-2 align-items-center">
        <select class="form-select form-select-sm" id="log-level-filter" style="width:120px">
          <option value="">All levels</option>
          <option value="error">Error</option>
          <option value="warn">Warn</option>
          <option value="info">Info</option>
          <option value="trade">Trade</option>
          <option value="debug">Debug</option>
        </select>
        <div class="form-check form-switch mb-0 ms-1">
          <input class="form-check-input" type="checkbox" id="log-live" checked>
          <label class="form-check-label small" for="log-live">Live</label>
        </div>
        <button class="btn btn-sm btn-outline-secondary" id="btn-download-logs">
          <i class="bi bi-download me-1"></i>Export
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs mb-3">
      <li class="nav-item"><button class="nav-link active" data-logtab="stream">Live Stream</button></li>
      <li class="nav-item"><button class="nav-link" data-logtab="audit">Audit Log</button></li>
    </ul>

    <!-- Log stream -->
    <div id="logtab-stream">
      <div class="card" style="background:var(--bg-secondary)">
        <div id="log-stream" class="log-stream" style="height:520px;overflow-y:auto;padding:12px;font-family:'SF Mono','Fira Code',monospace;font-size:0.75rem">
          <div class="text-muted">Loading recent logs…</div>
        </div>
      </div>
    </div>

    <!-- Audit log -->
    <div id="logtab-audit" class="d-none">
      <div class="card">
        <div class="table-responsive">
          <table class="table table-sm mb-0">
            <thead><tr><th>Action</th><th>Entity</th><th>Actor</th><th>When</th></tr></thead>
            <tbody id="audit-body">
              <tr><td colspan="4" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>`,

  async init() {
    const sb = window._supabase;
    let liveEnabled = true;
    let activeTab = 'stream';

    document.querySelectorAll('[data-logtab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.logtab;
        document.querySelectorAll('[data-logtab]').forEach(b => b.classList.toggle('active', b === btn));
        document.getElementById('logtab-stream')?.classList.toggle('d-none', activeTab !== 'stream');
        document.getElementById('logtab-audit')?.classList.toggle('d-none', activeTab !== 'audit');
        if (activeTab === 'audit') loadAudit();
      });
    });

    document.getElementById('log-live')?.addEventListener('change', e => {
      liveEnabled = e.target.checked;
    });

    document.getElementById('log-level-filter')?.addEventListener('change', () => loadRecentLogs());

    document.getElementById('btn-download-logs')?.addEventListener('click', async () => {
      try {
        const headers = {};
        const { data: { session } } = await sb.auth.getSession();
        if (session) headers.Authorization = `Bearer ${session.access_token}`;
        const res = await fetch('/api/logs/download', { headers });
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `predikt-logs-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
      } catch (e) { app.showToast(e.message, 'danger'); }
    });

    const LEVEL_COLORS = {
      error: 'var(--accent-danger)',
      warn:  'var(--accent-warning)',
      trade: 'var(--accent-success)',
      info:  'var(--text-secondary)',
      debug: 'var(--text-muted)',
    };

    function appendLog(row, prepend = false) {
      const container = document.getElementById('log-stream');
      if (!container) return;
      if (container.querySelector('.text-muted') && prepend) container.innerHTML = '';
      const color = LEVEL_COLORS[row.level] ?? LEVEL_COLORS.info;
      const el = document.createElement('div');
      el.className = 'log-line';
      el.innerHTML = `<span class="log-ts">${new Date(row.created_at).toLocaleTimeString()}</span><span style="color:${color};width:44px;flex-shrink:0">${row.level}</span><span style="color:var(--text-primary)">${app.escHtml(row.message)}</span>`;
      if (prepend) {
        container.prepend(el);
        while (container.children.length > 500) container.removeChild(container.lastChild);
      } else {
        container.append(el);
      }
    }

    async function loadRecentLogs() {
      const container = document.getElementById('log-stream');
      if (!container) return;
      container.innerHTML = '<div class="text-muted">Loading…</div>';
      const level = document.getElementById('log-level-filter')?.value ?? '';
      let q = sb.from('bot_logs').select('*').order('created_at', { ascending: false }).limit(200);
      if (level) q = q.eq('level', level);
      const { data } = await q;
      container.innerHTML = '';
      (data ?? []).forEach(r => appendLog(r, false));
    }

    async function loadAudit() {
      const tbody = document.getElementById('audit-body');
      if (!tbody) return;
      const { data } = await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
      if (!data?.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No audit entries</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(r => `
        <tr class="fade-row">
          <td class="small fw-500">${app.escHtml(r.action)}</td>
          <td class="text-muted small">${app.escHtml([r.entity_type, r.entity_id].filter(Boolean).join(' '))}</td>
          <td class="text-muted small">${app.escHtml(r.actor ?? '—')}</td>
          <td class="text-muted small">${app.timeAgo(r.created_at)}</td>
        </tr>`).join('');
    }

    // Live log realtime
    window.onLogInsert = (row) => {
      if (!liveEnabled || activeTab !== 'stream') return;
      const level = document.getElementById('log-level-filter')?.value ?? '';
      if (level && row.level !== level) return;
      appendLog(row, true);
    };

    await loadRecentLogs();

    return () => { window.onLogInsert = null; };
  },
});
