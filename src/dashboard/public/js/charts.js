// ─── Predikt Dashboard — charts.js ───────────────────────────────────────────
// Chart.js factory functions. All charts use the dark theme palette.
// Loaded on analytics.html and backtesting.html only.

'use strict';

const CHART_DEFAULTS = {
  color: '#b3b3b3',
  borderColor: '#282828',
  gridColor: 'rgba(255,255,255,0.06)',
  fontFamily: "'Rubik', system-ui, sans-serif",
};

Chart.defaults.color = CHART_DEFAULTS.color;
Chart.defaults.font.family = CHART_DEFAULTS.fontFamily;
Chart.defaults.plugins.legend.labels.color = CHART_DEFAULTS.color;

function baseScales(yLabel = '') {
  return {
    x: {
      grid: { color: CHART_DEFAULTS.gridColor },
      ticks: { color: CHART_DEFAULTS.color },
    },
    y: {
      grid: { color: CHART_DEFAULTS.gridColor },
      ticks: { color: CHART_DEFAULTS.color },
      title: yLabel ? { display: true, text: yLabel, color: CHART_DEFAULTS.color } : { display: false },
    },
  };
}

// ─── Equity curve (line) ──────────────────────────────────────────────────────

function createEquityChart(canvasId) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return null;
  return new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{
      label: 'Balance (USDC)',
      data: [],
      borderColor: '#1ed760',
      backgroundColor: 'rgba(30,215,96,0.08)',
      borderWidth: 2,
      pointRadius: 2,
      fill: true,
      tension: 0.3,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
      scales: baseScales('USDC'),
    },
  });
}

// ─── Daily PnL (bar) ─────────────────────────────────────────────────────────

function createDailyPnlChart(canvasId) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return null;
  return new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{
      label: 'Daily PnL',
      data: [],
      backgroundColor: [],
      borderRadius: 4,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: baseScales('USDC'),
    },
  });
}

// ─── Win rate over time (line) ────────────────────────────────────────────────

function createWinRateChart(canvasId) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return null;
  return new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{
      label: 'Win Rate %',
      data: [],
      borderColor: '#ff0024',
      backgroundColor: 'rgba(255,0,36,0.08)',
      borderWidth: 2,
      fill: true,
      tension: 0.3,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { ...baseScales('%'), y: { ...baseScales('%').y, min: 0, max: 100 } },
    },
  });
}

// ─── Trade size distribution (bar) ────────────────────────────────────────────

function createTradeSizeChart(canvasId) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return null;
  return new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{
      label: 'Trades',
      data: [],
      backgroundColor: 'rgba(255,0,36,0.6)',
      borderRadius: 4,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: baseScales('Count'),
    },
  });
}

// ─── Market category breakdown (doughnut) ─────────────────────────────────────

function createCategoryChart(canvasId) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return null;
  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{ data: [], backgroundColor: ['#ff0024','#1ed760','#0d6efd','#f0ad4e','#adb5bd','#6f42c1'], borderWidth: 0 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#b3b3b3', boxWidth: 12 } } },
    },
  });
}

// ─── EV distribution (bar) ────────────────────────────────────────────────────

function createEvChart(canvasId) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return null;
  return new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{
      label: 'Avg EV at Entry',
      data: [],
      backgroundColor: 'rgba(13,110,253,0.6)',
      borderRadius: 4,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: baseScales('EV'),
    },
  });
}

// ─── Chart update helpers ─────────────────────────────────────────────────────

function updateEquityChart(chart, snapshots) {
  chart.data.labels = snapshots.map(s => s.date);
  chart.data.datasets[0].data = snapshots.map(s => s.ending_balance);
  chart.update();
}

function updateDailyPnlChart(chart, snapshots) {
  chart.data.labels = snapshots.map(s => s.date);
  chart.data.datasets[0].data = snapshots.map(s => s.net_pnl);
  chart.data.datasets[0].backgroundColor = snapshots.map(s =>
    s.net_pnl >= 0 ? 'rgba(30,215,96,0.7)' : 'rgba(255,68,68,0.7)'
  );
  chart.update();
}

function updateWinRateChart(chart, snapshots) {
  chart.data.labels = snapshots.map(s => s.date);
  chart.data.datasets[0].data = snapshots.map(s => {
    const total = (s.trades_won ?? 0) + (s.trades_lost ?? 0);
    return total > 0 ? ((s.trades_won / total) * 100).toFixed(1) : 0;
  });
  chart.update();
}

function updateCategoryChart(chart, categoryMap) {
  const labels = Object.keys(categoryMap);
  const data = labels.map(l => categoryMap[l]);
  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update();
}

// Backtest equity curve
function createBacktestEquityChart(canvasId) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return null;
  return new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{
      label: 'Backtest Balance',
      data: [],
      borderColor: '#0d6efd',
      backgroundColor: 'rgba(13,110,253,0.08)',
      borderWidth: 2,
      fill: true,
      tension: 0.3,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: baseScales('USDC'),
    },
  });
}

window.charts = {
  createEquityChart, createDailyPnlChart, createWinRateChart,
  createTradeSizeChart, createCategoryChart, createEvChart, createBacktestEquityChart,
  updateEquityChart, updateDailyPnlChart, updateWinRateChart, updateCategoryChart,
};
