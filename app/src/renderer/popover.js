const REFRESH_MS = 18000;
const SEGMENTS = 20;

function colorTier(pct) {
  if (pct == null) return null;
  if (pct >= 80) return 'coral';
  if (pct >= 50) return 'butter';
  return 'mint';
}

function renderBar(container, pct) {
  container.innerHTML = '';
  const filled = pct == null ? 0 : Math.round((Math.min(Math.max(pct, 0), 100) / 100) * SEGMENTS);
  const tier = colorTier(pct);
  for (let i = 0; i < SEGMENTS; i++) {
    const seg = document.createElement('div');
    seg.className = 'bar-segment';
    if (i < filled && tier) seg.classList.add('filled', tier);
    container.appendChild(seg);
  }
}

function formatCountdown(resetsAtEpochSeconds) {
  if (resetsAtEpochSeconds == null) return 'reset --';
  const diffSeconds = resetsAtEpochSeconds - Math.floor(Date.now() / 1000);
  if (diffSeconds <= 0) return 'reset ahora';
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  return `reset en ${hours}h ${minutes}m`;
}

function formatUpdated(writtenAtEpochSeconds) {
  if (writtenAtEpochSeconds == null) return 'ultima actualizacion: --';
  const d = new Date(writtenAtEpochSeconds * 1000);
  return `ultima actualizacion: ${d.toLocaleTimeString()}`;
}

function renderMeter(sectionId, pct, resetsAt) {
  const section = document.getElementById(sectionId);
  section.querySelector('[data-field="pct"]').textContent = pct == null ? '--%' : `${pct}%`;
  renderBar(section.querySelector('[data-field="bar"]'), pct);
  section.querySelector('[data-field="reset"]').textContent = formatCountdown(resetsAt);
}

const AVAILABLE_TEMPLATE = document.querySelector('.panel').innerHTML;

function renderUnavailable(message) {
  const panel = document.querySelector('.panel');
  panel.innerHTML = ''; // clear without ever inserting untrusted text as HTML

  const header = document.createElement('header');
  header.className = 'panel-title';
  header.textContent = 'CLAUDE USAGE';

  const body = document.createElement('div');
  body.className = 'unavailable';
  body.textContent = message || 'Sin datos disponibles.'; // textContent, never innerHTML

  panel.appendChild(header);
  panel.appendChild(body);
}

function ensureAvailableTemplate() {
  const panel = document.querySelector('.panel');
  if (!panel.querySelector('#five-hour')) panel.innerHTML = AVAILABLE_TEMPLATE;
}

async function refresh() {
  const status = await window.quota.read();

  if (!status || !status.available) {
    renderUnavailable(status && status.message);
    return;
  }

  ensureAvailableTemplate();
  renderMeter('five-hour', status.five_hour?.pct ?? null, status.five_hour?.resets_at ?? null);
  renderMeter('seven-day', status.seven_day?.pct ?? null, status.seven_day?.resets_at ?? null);
  document.querySelector('[data-field="updated"]').textContent = formatUpdated(status.written_at);
}

document.addEventListener('DOMContentLoaded', () => {
  refresh();
  setInterval(refresh, REFRESH_MS);
});
