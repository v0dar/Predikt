// ─── Page: Settings ───────────────────────────────────────────────────────────

router.register('/settings', {
  title: 'Settings',
  template: () => `
    <div class="page-header">
      <h5 class="page-title">Settings</h5>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-secondary" id="btn-preset-micro">Micro preset</button>
        <button class="btn btn-sm btn-outline-secondary" id="btn-preset-starter">Starter preset</button>
        <button class="btn btn-sm btn-outline-secondary" id="btn-preset-standard">Standard preset</button>
        <button class="btn btn-sm btn-primary" id="btn-save-settings">Save all</button>
      </div>
    </div>

    <div class="row g-3">
      <!-- Core settings -->
      <div class="col-lg-6">
        <div class="card mb-3">
          <div class="card-header-label mb-3">Core</div>
          <div class="row g-3" id="settings-core"></div>
        </div>
        <div class="card">
          <div class="card-header-label mb-3">Risk Limits</div>
          <div class="row g-3" id="settings-risk"></div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card mb-3">
          <div class="card-header-label mb-3">Execution</div>
          <div class="row g-3" id="settings-exec"></div>
        </div>
        <!-- History -->
        <div class="card">
          <div class="card-header-label mb-2">Change History</div>
          <div class="table-responsive" style="max-height:300px;overflow-y:auto">
            <table class="table table-sm mb-0">
              <thead><tr><th>Key</th><th>Old</th><th>New</th><th>When</th></tr></thead>
              <tbody id="settings-history-body">
                <tr><td colspan="4" class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`,

  async init() {
    const FIELD_GROUPS = {
      core: [
        { key: 'MODE',               label: 'Mode',             type: 'select', opts: ['demo','live'] },
        { key: 'STRATEGY',           label: 'Strategy',         type: 'select', opts: ['value-bet'] },
        { key: 'DRY_RUN',            label: 'Dry run',          type: 'bool' },
        { key: 'CRON_SCHEDULE',      label: 'Cron schedule',    type: 'text' },
        { key: 'TELEGRAM_NOTIFICATIONS', label: 'Telegram alerts', type: 'bool' },
        { key: 'DEMO_STARTING_BALANCE', label: 'Demo balance $', type: 'number' },
      ],
      risk: [
        { key: 'MAX_BET_USD',           label: 'Max bet $',        type: 'number' },
        { key: 'MAX_BET_PERCENT',       label: 'Max bet %',        type: 'number' },
        { key: 'MIN_EDGE_PERCENT',      label: 'Min edge %',       type: 'number' },
        { key: 'KELLY_FRACTION',        label: 'Kelly fraction',   type: 'number' },
        { key: 'MAX_OPEN_POSITIONS',    label: 'Max positions',    type: 'number' },
        { key: 'DAILY_LOSS_LIMIT_USD',  label: 'Daily loss limit $', type: 'number' },
        { key: 'AUTO_PAUSE_WIN_RATE_THRESHOLD', label: 'Auto-pause win rate %', type: 'number' },
        { key: 'AUTO_PAUSE_LOOKBACK_TRADES',    label: 'Auto-pause lookback',   type: 'number' },
      ],
      exec: [
        { key: 'MAX_SLIPPAGE_PERCENT',     label: 'Max slippage %',     type: 'number' },
        { key: 'MIN_LIQUIDITY_MULTIPLIER', label: 'Liquidity multiplier', type: 'number' },
        { key: 'MIN_MATIC_BALANCE',        label: 'Min MATIC balance',  type: 'number' },
        { key: 'AUTO_SCALE_BETS',          label: 'Auto-scale bets',    type: 'bool' },
      ],
    };

    const PRESETS = {
      micro:    { MAX_BET_USD:'1', MIN_EDGE_PERCENT:'10', KELLY_FRACTION:'0.20', MAX_OPEN_POSITIONS:'2', DAILY_LOSS_LIMIT_USD:'3' },
      starter:  { MAX_BET_USD:'5', MIN_EDGE_PERCENT:'7',  KELLY_FRACTION:'0.25', MAX_OPEN_POSITIONS:'4', DAILY_LOSS_LIMIT_USD:'15' },
      standard: { MAX_BET_USD:'10',MIN_EDGE_PERCENT:'5',  KELLY_FRACTION:'0.25', MAX_OPEN_POSITIONS:'5', DAILY_LOSS_LIMIT_USD:'50' },
    };

    const sb = window._supabase;
    let currentSettings = {};

    async function loadSettings() {
      const { data } = await sb.from('settings').select('*');
      currentSettings = Object.fromEntries((data ?? []).map(r => [r.key, r.value]));
      renderGroup('settings-core', FIELD_GROUPS.core);
      renderGroup('settings-risk', FIELD_GROUPS.risk);
      renderGroup('settings-exec', FIELD_GROUPS.exec);
      loadHistory();
    }

    function renderGroup(containerId, fields) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = fields.map(f => {
        const val = currentSettings[f.key] ?? '';
        if (f.type === 'bool') {
          const checked = val === 'true' ? 'checked' : '';
          return `<div class="col-12">
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" id="s_${f.key}" data-key="${f.key}" ${checked}>
              <label class="form-check-label small" for="s_${f.key}">${f.label}</label>
            </div>
          </div>`;
        }
        if (f.type === 'select') {
          const opts = f.opts.map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${o}</option>`).join('');
          return `<div class="col-12 col-sm-6">
            <label class="form-label" for="s_${f.key}">${f.label}</label>
            <select class="form-select form-select-sm" id="s_${f.key}" data-key="${f.key}">${opts}</select>
          </div>`;
        }
        return `<div class="col-12 col-sm-6">
          <label class="form-label" for="s_${f.key}">${f.label}</label>
          <input type="${f.type === 'number' ? 'number' : 'text'}" class="form-control form-control-sm" id="s_${f.key}" data-key="${f.key}" value="${app.escHtml(val)}" step="any">
        </div>`;
      }).join('');
    }

    async function saveSettings() {
      const updates = [];
      document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.dataset.key;
        const value = el.type === 'checkbox' ? String(el.checked) : el.value;
        updates.push({ key, value, updated_at: new Date().toISOString() });
      });
      for (const u of updates) {
        await sb.from('settings').upsert(u, { onConflict: 'key' });
      }
      app.showToast('Settings saved');
      loadHistory();
    }

    async function loadHistory() {
      const tbody = document.getElementById('settings-history-body');
      if (!tbody) return;
      const { data } = await sb.from('settings_history').select('*').order('changed_at', { ascending: false }).limit(30);
      if (!data?.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-2 small">No changes yet</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(r => `
        <tr class="fade-row">
          <td class="small fw-500">${app.escHtml(r.key)}</td>
          <td class="text-muted small">${app.escHtml(r.previous_value ?? '—')}</td>
          <td class="small">${app.escHtml(r.new_value)}</td>
          <td class="text-muted small">${app.timeAgo(r.changed_at)}</td>
        </tr>`).join('');
    }

    function applyPreset(name) {
      const preset = PRESETS[name];
      if (!preset) return;
      Object.entries(preset).forEach(([key, val]) => {
        const el = document.getElementById(`s_${key}`);
        if (el) el.value = val;
      });
      app.showToast(`${name} preset applied — click Save to confirm`, 'warning');
    }

    document.getElementById('btn-save-settings')?.addEventListener('click', saveSettings);
    document.getElementById('btn-preset-micro')?.addEventListener('click', () => applyPreset('micro'));
    document.getElementById('btn-preset-starter')?.addEventListener('click', () => applyPreset('starter'));
    document.getElementById('btn-preset-standard')?.addEventListener('click', () => applyPreset('standard'));

    // Live settings update
    window.onSettingsChange = () => loadSettings();

    await loadSettings();

    return () => { window.onSettingsChange = null; };
  },
});
