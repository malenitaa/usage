const REFRESH_MS = 18000;
const SEGMENTS = 20;

// Populated once from the main process (which resolves the system
// language) before the first render; window.i18n never varies mid-session.
let T = null;

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
  if (resetsAtEpochSeconds == null) return T.resetUnknown;
  const diffSeconds = resetsAtEpochSeconds - Math.floor(Date.now() / 1000);
  if (diffSeconds <= 0) return T.resetNow;
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  return T.resetInTemplate.replace('{h}', hours).replace('{m}', minutes);
}

function formatUpdated(writtenAtEpochSeconds) {
  if (writtenAtEpochSeconds == null) return T.updatedUnknown;
  const d = new Date(writtenAtEpochSeconds * 1000);
  return `${T.updatedPrefix}${d.toLocaleTimeString()}`;
}

function renderMeter(sectionId, pct, resetsAt, staleSuspect) {
  const section = document.getElementById(sectionId);
  section.querySelector('[data-field="pct"]').textContent = pct == null ? '--%' : `${pct}%`;
  renderBar(section.querySelector('[data-field="bar"]'), pct);
  section.querySelector('[data-field="reset"]').textContent = formatCountdown(resetsAt);
  section.querySelector('[data-field="stale"]').textContent = staleSuspect ? T.staleSuspect : '';
}

// Captured lazily, after localizeStaticText() has fixed up the header and
// disclaimer baked into index.html, so ensureAvailableTemplate() below
// never reintroduces the wrong language.
let AVAILABLE_TEMPLATE = null;

function localizeStaticText() {
  document.querySelector('.panel-title').textContent = T.panelTitle;
  document.querySelector('.disclaimer').textContent = T.disclaimer;
  document.querySelectorAll('[data-field="reset"]').forEach((el) => { el.textContent = T.resetUnknown; });
  document.querySelector('[data-field="updated"]').textContent = T.updatedUnknown;
}

function renderUnavailable(message) {
  const panel = document.querySelector('.panel');
  panel.innerHTML = ''; // clear without ever inserting untrusted text as HTML

  const header = document.createElement('header');
  header.className = 'panel-title';
  header.textContent = T.panelTitle;

  const body = document.createElement('div');
  body.className = 'unavailable';
  body.textContent = message || T.noDataAvailable; // textContent, never innerHTML

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
  renderMeter('five-hour', status.five_hour?.pct ?? null, status.five_hour?.resets_at ?? null, status.five_hour?.stale_suspect ?? false);
  renderMeter('seven-day', status.seven_day?.pct ?? null, status.seven_day?.resets_at ?? null, status.seven_day?.stale_suspect ?? false);
  document.querySelector('[data-field="updated"]').textContent = formatUpdated(status.written_at);
  document.querySelector('[data-field="model"]').textContent = status.model ? `${T.modelPrefix}${status.model}` : '';
}

document.addEventListener('DOMContentLoaded', async () => {
  T = await window.i18n.strings();
  localizeStaticText();
  AVAILABLE_TEMPLATE = document.querySelector('.panel').innerHTML;

  refresh();
  setInterval(refresh, REFRESH_MS);
  window.quota.onForceRefresh(refresh);
});
