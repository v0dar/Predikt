// ─── Predikt Dashboard — router.js ───────────────────────────────────────────
// Lightweight client-side router using History API.
// Pages fade in. No full-page reloads. Ever.

'use strict';

(function () {
  const routes = new Map();
  let activeCleanup = null;

  function setActiveNav(path) {
    document.querySelectorAll('#sidebar-left .nav-item').forEach(el => {
      const href = el.getAttribute('href');
      const isActive = href === path || (href === '/' && (path === '/' || path === ''));
      el.classList.toggle('active', isActive);
    });
  }

  async function render(rawPath) {
    const path = rawPath || '/';

    // Tear down previous page
    if (typeof activeCleanup === 'function') {
      try { activeCleanup(); } catch (e) { console.warn('[router] cleanup error', e); }
      activeCleanup = null;
    }

    // Destroy any lingering Chart.js instances
    if (window._activeCharts) {
      window._activeCharts.forEach(c => { try { c.destroy(); } catch {} });
      window._activeCharts = [];
    }

    setActiveNav(path);

    const page = routes.get(path) ?? routes.get('*');
    if (!page) {
      document.getElementById('main-content').innerHTML =
        '<div class="alert alert-secondary m-4">Page not found.</div>';
      return;
    }

    if (page.title) document.title = `Predikt — ${page.title}`;

    const main = document.getElementById('main-content');
    if (!main) return;

    // Fade out current content
    main.style.opacity = '0';
    main.style.transition = 'opacity 0.15s ease';

    await new Promise(r => setTimeout(r, 150));

    // Render new content
    try {
      main.innerHTML = typeof page.template === 'function' ? page.template() : (page.template ?? '');
    } catch (e) {
      main.innerHTML = `<div class="alert alert-danger m-4">Template error: ${String(e.message)}</div>`;
    }

    // Fade in
    main.style.opacity = '0';
    requestAnimationFrame(() => {
      main.style.transition = 'opacity 0.25s ease';
      main.style.opacity = '1';
    });

    // Init page
    try {
      if (typeof page.init === 'function') {
        activeCleanup = (await page.init()) ?? null;
      }
    } catch (e) {
      console.error('[router] page init error', e);
      main.insertAdjacentHTML('afterbegin',
        `<div class="alert alert-danger m-3">Page init error: ${String(e.message)}</div>`);
    }
  }

  function navigate(path) {
    if (location.pathname === path) return;
    history.pushState({}, '', path);
    render(path);
  }

  // Intercept all internal link clicks tagged with data-link
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-link]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || /^(https?:)?\/\//.test(href) || href.startsWith('mailto:')) return;
    e.preventDefault();
    navigate(href);
  });

  window.addEventListener('popstate', () => render(location.pathname));

  window.router = {
    register: (path, mod) => routes.set(path, mod),
    navigate,
    start: () => render(location.pathname),
  };

  window._activeCharts = [];
})();
