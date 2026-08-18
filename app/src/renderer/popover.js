const REFRESH_MS = 18000;

// Populated once from the main process (which resolves the system
// language) before the first render; window.i18n never varies mid-session.
let T = null;

// The three semaphore colors, as macOS reports them. Unlike the strings these
// DO vary mid-session — macOS returns different values for the same named
// color in light vs dark appearance — so they are re-read on every refresh.
let COLORS = {};

// Thresholds mirror palette.js's tierForPct on the main side.
function colorTier(pct) {
  if (pct == null) return null;
  if (pct >= 80) return 'red';
  if (pct >= 50) return 'yellow';
  return 'green';
}

// One continuous fill rather than a row of discrete blocks, so the bar reads
// as a smooth level. Both the width and the color are set from JS (the color
// because it comes from macOS, not from a stylesheet); CSS animates the
// transition between refreshes.
//
// Note the clamp: the percentage itself can exceed 100 — that is what Claude
// Code reports when a request that was admitted under the cap finishes over it
// — but the bar stops at full. The exact number is still shown next to it.
function renderBar(fill, pct) {
  const clamped = pct == null ? 0 : Math.min(Math.max(pct, 0), 100);
  fill.style.width = `${clamped}%`;
  const tier = colorTier(pct);
  fill.style.backgroundColor = tier ? COLORS[tier] : COLORS.none;
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
  // Capped at 100 to match Anthropic's own usage screen — see formatPct() in
  // main.js for why the raw number can go above it.
  section.querySelector('[data-field="pct"]').textContent = pct == null ? '--%' : `${Math.min(pct, 100)}%`;
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
  const [status, colors] = await Promise.all([window.quota.read(), window.palette.colors()]);
  COLORS = colors;

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
  [T, COLORS] = await Promise.all([window.i18n.strings(), window.palette.colors()]);
  localizeStaticText();
  AVAILABLE_TEMPLATE = document.querySelector('.panel').innerHTML;

  refresh();
  setInterval(refresh, REFRESH_MS);
  window.quota.onForceRefresh(refresh);
});
