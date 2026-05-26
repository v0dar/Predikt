// ─── Page: Wallet ─────────────────────────────────────────────────────────────

router.register('/wallet', {
  title: 'Wallet',
  template: () => `
    <div class="page-header">
      <h5 class="page-title">Wallet</h5>
      <button class="btn btn-sm btn-outline-secondary" id="btn-refresh-wallet">
        <i class="bi bi-arrow-repeat me-1"></i>Refresh
      </button>
    </div>

    <!-- Balance cards -->
    <div class="row g-3 mb-4">
      <div class="col-sm-6 col-xl-3">
        <div class="card data-card">
          <div class="stat-label">USDC Balance</div>
          <div class="stat-value text-success" id="w-usdc">—</div>
        </div>
      </div>
      <div class="col-sm-6 col-xl-3">
        <div class="card data-card">
          <div class="stat-label">MATIC Balance</div>
          <div class="stat-value" id="w-matic">—</div>
        </div>
      </div>
      <div class="col-sm-12 col-xl-6">
        <div class="card">
          <div class="stat-label">Wallet Address</div>
          <div class="mt-1" id="w-address" style="font-family:monospace;font-size:0.78rem;word-break:break-all;color:var(--text-secondary)">—</div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="row g-3">
      <!-- Approve USDC -->
      <div class="col-lg-6">
        <div class="card">
          <div class="card-header-label mb-3">Approve USDC Allowance</div>
          <p class="text-muted small mb-3">
            Grants the Polymarket proxy contract permission to spend USDC on your behalf.
            Required before placing any live orders.
          </p>
          <form id="approve-form">
            <div class="mb-3">
              <label class="form-label">Amount (USDC)</label>
              <input type="number" class="form-control form-control-sm" id="approve-amount" value="1000" min="1" step="1">
            </div>
            <button type="submit" class="btn btn-primary btn-sm w-100">
              <span id="approve-spinner" class="spinner-border spinner-border-sm me-2 d-none"></span>
              Approve
            </button>
          </form>
          <div id="approve-result" class="mt-2"></div>
        </div>
      </div>

      <!-- Withdraw USDC -->
      <div class="col-lg-6">
        <div class="card">
          <div class="card-header-label mb-3">Withdraw USDC</div>
          <p class="text-muted small mb-3">Transfer USDC from your trading wallet to another address.</p>
          <form id="withdraw-form">
            <div class="mb-3">
              <label class="form-label">Recipient Address</label>
              <input type="text" class="form-control form-control-sm" id="withdraw-to" placeholder="0x…">
            </div>
            <div class="mb-3">
              <label class="form-label">Amount (USDC)</label>
              <input type="number" class="form-control form-control-sm" id="withdraw-amount" min="0.01" step="0.01">
            </div>
            <button type="submit" class="btn btn-danger btn-sm w-100">
              <span id="withdraw-spinner" class="spinner-border spinner-border-sm me-2 d-none"></span>
              Withdraw
            </button>
          </form>
          <div id="withdraw-result" class="mt-2"></div>
        </div>
      </div>
    </div>`,

  async init() {
    async function loadWallet() {
      try {
        const w = await app.apiGet('/wallet');
        app.setText('w-usdc', w.usdc != null ? `$${Number(w.usdc).toFixed(2)}` : '—');
        app.setText('w-matic', w.matic != null ? `${Number(w.matic).toFixed(4)}` : '—');
        app.setText('w-address', w.address ?? (w.mode === 'demo' ? 'Demo mode — no wallet' : '—'));
      } catch (e) {
        app.setText('w-usdc', 'Error');
        app.setText('w-matic', 'Error');
      }
    }

    function txResult(containerId, txHash, type = 'success') {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = type === 'success'
        ? `<div class="alert alert-success py-2 small mb-0">✓ TX: <code style="font-size:0.7rem">${app.escHtml(txHash)}</code></div>`
        : `<div class="alert alert-danger py-2 small mb-0">${app.escHtml(txHash)}</div>`;
    }

    document.getElementById('btn-refresh-wallet')?.addEventListener('click', loadWallet);

    document.getElementById('approve-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const spinner = document.getElementById('approve-spinner');
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; spinner.classList.remove('d-none');
      try {
        const amount = parseFloat(document.getElementById('approve-amount').value);
        const { txHash } = await app.apiPost('/wallet/approve', { amount });
        txResult('approve-result', txHash, 'success');
        app.showToast('USDC approved');
      } catch (err) {
        txResult('approve-result', err.message, 'danger');
        app.showToast(err.message, 'danger');
      } finally {
        btn.disabled = false; spinner.classList.add('d-none');
      }
    });

    document.getElementById('withdraw-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const spinner = document.getElementById('withdraw-spinner');
      const btn = e.target.querySelector('button[type=submit]');
      const to = document.getElementById('withdraw-to').value.trim();
      const amount = parseFloat(document.getElementById('withdraw-amount').value);
      if (!to.startsWith('0x') || to.length < 42) {
        app.showToast('Invalid recipient address', 'danger'); return;
      }
      if (!amount || amount <= 0) { app.showToast('Invalid amount', 'danger'); return; }

      if (!confirm(`Send $${amount} USDC to ${to}?`)) return;
      btn.disabled = true; spinner.classList.remove('d-none');
      try {
        const { txHash } = await app.apiPost('/wallet/withdraw', { to, amount });
        txResult('withdraw-result', txHash, 'success');
        app.showToast(`Withdrew $${amount} USDC`);
        await loadWallet();
      } catch (err) {
        txResult('withdraw-result', err.message, 'danger');
        app.showToast(err.message, 'danger');
      } finally {
        btn.disabled = false; spinner.classList.add('d-none');
      }
    });

    // Auto-refresh wallet balance every 30s while on this page
    await loadWallet();
    const interval = setInterval(loadWallet, 30_000);

    return () => clearInterval(interval);
  },
});
