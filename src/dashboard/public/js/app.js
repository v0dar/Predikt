// ─── Predikt Dashboard — app.js ──────────────────────────────────────────────
// SPA core: Supabase init, auth, dual-sidebar injection, shared utilities.
// Sidebars are permanent. Only #main-content ever swaps.

'use strict';

// ─── Supabase init ────────────────────────────────────────────────────────────

let _sbClient = null;

async function initSupabase() {
  if (_sbClient) return _sbClient;
  const { supabaseUrl, supabaseAnonKey } = await fetch('/api/config').then(r => r.json());
  _sbClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  window._supabase = _sbClient;
  return _sbClient;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function requireAuth() {
  const sb = await initSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = '/login'; return null; }
  window._session = session;
  return session;
}

async function getAuthHeaders() {
  const sb = await initSupabase();
  const { data: { session } } = await sb.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// ─── API helpers ───────────────────────────────────────────────────────────────

async function apiGet(path) {
  const res = await fetch(`/api${path}`, { headers: await getAuthHeaders() });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function apiPost(path, body = {}) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `POST ${path} → ${res.status}`);
  }
  return res.json();
}

// ─── Left sidebar ─────────────────────────────────────────────────────────────

const NAV = [
  { section: 'HOME' },
  { href: '/',            icon: 'bi-speedometer2', label: 'Overview'    },
  { href: '/analytics',   icon: 'bi-graph-up',     label: 'Analytics'   },
  { section: 'MARKETS' },
  { href: '/markets',     icon: 'bi-globe2',        label: 'Markets'     },
  { href: '/trades',      icon: 'bi-list-check',   label: 'Trades'      },
  { href: '/backtesting', icon: 'bi-play-circle',  label: 'Backtesting' },
  { section: 'BOT' },
  { href: '/settings',    icon: 'bi-sliders',      label: 'Settings'    },
  { href: '/logs',        icon: 'bi-terminal',     label: 'Logs'        },
  { href: '/wallet',      icon: 'bi-wallet2',      label: 'Wallet'      },
];

function buildLeftSidebar() {
  const items = NAV.map(item => {
    if (item.section) {
      return `<div class="sidebar-section-label">${item.section}</div><nav class="sidebar-nav">`;
    }
    return `<a href="${item.href}" class="nav-item" data-link>
      <i class="bi ${item.icon}"></i>${item.label}
    </a>`;
  });

  // Close the last <nav> section
  let html = items.join('');
  const navCount = NAV.filter(i => i.section).length;
  html += '</nav>'.repeat(navCount);

  return `
    <aside class="sidebar-left" id="sidebar-left">
      <div class="sidebar-brand">
        <img src="/logo.svg" alt="Predikt" width="32" height="32">
        <span>Predikt</span>
      </div>
      ${html}
      <div class="sidebar-footer">
        <div id="bot-status-badge"><span class="badge bg-secondary">Connecting…</span></div>
        <div class="sidebar-balance" id="sidebar-balance">USDC: —</div>
        <a href="#" class="sidebar-logout" id="logout-btn">
          <i class="bi bi-box-arrow-left"></i>Sign out
        </a>
      </div>
    </aside>`;
}

// ─── Right sidebar ─────────────────────────────────────────────────────────────

function buildRightSidebar() {
  return `
    <aside class="sidebar-right" id="sidebar-right">
      <div class="right-tabs">
        <button class="right-tab-btn active" data-panel="status">Status</button>
        <button class="right-tab-btn" data-panel="activity">Activity</button>
        <button class="right-tab-btn" data-panel="alerts">Alerts</button>
      </div>

      <!-- Status panel -->
      <div class="right-tab-panel active" id="rpanel-status">
        <div class="right-stat">
          <span class="right-stat-label">State</span>
          <span class="right-stat-value" id="rs-state">—</span>
        </div>
        <div class="right-stat">
          <span class="right-stat-label">Mode</span>
          <span class="right-stat-value" id="rs-mode">—</span>
        </div>
        <div class="right-stat">
          <span class="right-stat-label">Balance</span>
          <span class="right-stat-value" id="rs-balance">—</span>
        </div>
        <div class="right-stat">
          <span class="right-stat-label">MATIC</span>
          <span class="right-stat-value" id="rs-matic">—</span>
        </div>
        <div class="right-stat">
          <span class="right-stat-label">Positions</span>
          <span class="right-stat-value" id="rs-positions">—</span>
        </div>
        <div class="right-stat">
          <span class="right-stat-label">Regime</span>
          <span class="right-stat-value" id="rs-regime">—</span>
        </div>
        <div class="right-stat">
          <span class="right-stat-label">Last scan</span>
          <span class="right-stat-value" id="rs-last-scan">—</span>
        </div>
        <div class="right-stat">
          <span class="right-stat-label">Dry run</span>
          <span class="right-stat-value" id="rs-dryrun">—</span>
        </div>
      </div>

      <!-- Activity panel -->
      <div class="right-tab-panel" id="rpanel-activity">
        <div id="activity-feed" class="activity-feed">
          <div class="text-muted small">Waiting for events…</div>
        </div>
      </div>

      <!-- Alerts panel -->
      <div class="right-tab-panel" id="rpanel-alerts">
        <div id="alerts-feed" class="activity-feed">
          <div class="text-muted small">No recent alerts.</div>
        </div>
      </div>
    </aside>`;
}

function wireRightTabs() {
  document.querySelectorAll('.right-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.right-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.right-tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`rpanel-${btn.dataset.panel}`)?.classList.add('active');
    });
  });
}

// ─── Status widgets ───────────────────────────────────────────────────────────

const STATE_COLORS = {
  READY: 'success', SCANNING: 'primary', PLACING_ORDER: 'warning',
  WAITING_CONFIRMATION: 'info', PAUSED: 'warning',
  ERROR_RECOVERY: 'danger', EMERGENCY_STOPPED: 'danger',
  BOOTING: 'secondary', SYNCING: 'info', SHUTTING_DOWN: 'secondary',
};

function updateStatusWidgets(status) {
  if (!status) return;

  // Left sidebar badge
  const badge = document.getElementById('bot-status-badge');
  if (badge) {
    const c = STATE_COLORS[status.state] ?? 'secondary';
    const dry = status.dry_run ? ' <span class="badge bg-warning text-dark ms-1" style="font-size:0.52rem">DRY</span>' : '';
    badge.innerHTML = `<span class="badge bg-${c}">${status.state ?? '—'}</span>${dry}`;
  }
  const bal = document.getElementById('sidebar-balance');
  if (bal && status.usdc_balance != null) bal.textContent = `USDC: $${Number(status.usdc_balance).toFixed(2)}`;

  // Right status panel
  setText('rs-state', status.state ?? '—');
  setText('rs-mode', (status.mode ?? '—').toUpperCase());
  setText('rs-balance', status.usdc_balance != null ? `$${Number(status.usdc_balance).toFixed(2)}` : '—');
  setText('rs-positions', status.open_positions != null ? `${status.open_positions} open` : '—');
  setText('rs-regime', status.current_regime ?? '—');
  setText('rs-dryrun', status.dry_run ? 'Yes' : 'No');
  if (status.last_scan_at) setText('rs-last-scan', timeAgo(status.last_scan_at));

  window._botStatus = status;
  if (typeof window.onStatusUpdate === 'function') window.onStatusUpdate(status);
}

async function pollStatus() {
  try {
    const status = await fetch('/api/status').then(r => r.json());
    updateStatusWidgets(status);
  } catch {}
}

// ─── Activity feed ────────────────────────────────────────────────────────────

function pushActivity(message, level = 'info') {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  if (feed.querySelector('.text-muted')) feed.innerHTML = '';
  const c = { info: 'var(--text-secondary)', warn: 'var(--accent-warning)', error: 'var(--accent-danger)', trade: 'var(--accent-success)' }[level] ?? 'var(--text-secondary)';
  const el = document.createElement('div');
  el.className = 'activity-item';
  el.innerHTML = `<span style="color:var(--text-muted);font-size:0.65rem">${new Date().toLocaleTimeString()}</span><span style="color:${c};font-size:0.73rem;line-height:1.4">${escHtml(message)}</span>`;
  feed.prepend(el);
  while (feed.children.length > 50) feed.removeChild(feed.lastChild);
}

function pushAlert(message, level = 'warn') {
  const feed = document.getElementById('alerts-feed');
  if (!feed) return;
  if (feed.querySelector('.text-muted')) feed.innerHTML = '';
  const c = level === 'error' ? 'var(--accent-danger)' : 'var(--accent-warning)';
  const el = document.createElement('div');
  el.className = 'activity-item';
  el.innerHTML = `<span style="color:var(--text-muted);font-size:0.65rem">${new Date().toLocaleTimeString()}</span><span style="color:${c};font-size:0.73rem">${escHtml(message)}</span>`;
  feed.prepend(el);
  while (feed.children.length > 30) feed.removeChild(feed.lastChild);
}

window.pushActivity = pushActivity;
window.pushAlert = pushAlert;

// ─── Utilities ────────────────────────────────────────────────────────────────

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function timeAgo(iso) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  return `${Math.floor(d/3600)}h ago`;
}
function fmtUsd(v)  { const n=parseFloat(v); return isNaN(n)?'—':`${n>=0?'+':''}$${Math.abs(n).toFixed(2)}`; }
function fmtPct(v)  { const n=parseFloat(v); return isNaN(n)?'—':`${n.toFixed(1)}%`; }
function fmtDate(i) { return i ? new Date(i).toLocaleString() : '—'; }
function fmtSide(s) { return s==='YES'?'<span class="badge badge-yes">YES</span>':'<span class="badge badge-no">NO</span>'; }
function statusBadge(s) {
  const m={open:'secondary',filled:'success',partial:'warning',cancelled:'danger',expired:'danger',resolved:'primary'};
  return `<span class="badge bg-${m[s]??'secondary'}">${s}</span>`;
}
function pnlSpan(val) {
  const n=parseFloat(val); if(isNaN(n))return'—';
  const c=n>=0?'var(--accent-success)':'var(--accent-danger)';
  return `<span style="color:${c}">${n>=0?'+':''}$${Math.abs(n).toFixed(2)}</span>`;
}
function showToast(msg, type='success') {
  const cont=document.getElementById('toast-container');
  if(!cont)return;
  const id=`t${Date.now()}`;
  const bg=type==='success'?'bg-success':type==='danger'?'bg-danger':'bg-warning text-dark';
  cont.insertAdjacentHTML('beforeend',`<div id="${id}" class="toast align-items-center text-white ${bg} border-0" role="alert"><div class="d-flex"><div class="toast-body">${escHtml(msg)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div>`);
  const el=document.getElementById(id);
  new bootstrap.Toast(el,{delay:4000}).show();
  el.addEventListener('hidden.bs.toast',()=>el.remove());
}

window.app = {
  apiGet, apiPost, setText, escHtml, timeAgo,
  fmtUsd, fmtPct, fmtDate, fmtSide, statusBadge, pnlSpan, showToast,
  updateStatusWidgets, pushActivity, pushAlert,
};

// ─── User identity + role ────────────────────────────────────────────────────

window._currentUser = null;   // { id, email, displayName, role, isAdmin }

async function fetchMe() {
  try {
    const headers = await getAuthHeaders();
    const me = await fetch('/api/me', { headers }).then(r => r.json());
    window._currentUser = me;

    // Apply admin class to body — CSS uses it to show/hide admin-only elements
    if (me.isAdmin) document.body.classList.add('is-admin');

    // Update sidebar display name
    const balEl = document.getElementById('sidebar-balance');
    if (balEl && me.displayName) balEl.title = me.displayName;

    return me;
  } catch { return null; }
}

// ─── App start ────────────────────────────────────────────────────────────────

async function startApp() {
  const session = await requireAuth();
  if (!session) return;

  const layout = document.getElementById('layout');
  layout.insertAdjacentHTML('afterbegin', buildLeftSidebar());
  layout.insertAdjacentHTML('beforeend', buildRightSidebar());

  wireRightTabs();

  document.getElementById('logout-btn').addEventListener('click', async e => {
    e.preventDefault();
    await (await initSupabase()).auth.signOut();
    window.location.href = '/login';
  });

  // Fetch user role (sets body.is-admin if admin)
  await fetchMe();

  await pollStatus();
  setInterval(pollStatus, 15_000);

  if (typeof window.initRealtime === 'function') await window.initRealtime();

  window.router.start();
}

window.startApp = startApp;
window.fetchMe = fetchMe;
