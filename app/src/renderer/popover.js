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

// Compact token counts: 245897 -> "245.9K", 1000000 -> "1M". Trailing ".0" is
// dropped so the common round numbers (1M context) read as they are written.
function formatTokens(n) {
  if (n == null) return null;
  const units = [[1e9, 'G'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, suffix] of units) {
    if (Math.abs(n) >= size) {
      const v = n / size;
      return `${v.toFixed(1).replace(/\.0$/, '')}${suffix}`;
    }
  }
  return String(n);
}

// Per-session figures, unlike everything above them, which is per account. The
// state file records whichever session refreshed last, so the name is shown
// alongside: without it these numbers would look like they describe the
// session you happen to be looking at, which is only usually true.
function renderSession(session) {
  const tokensEl = document.querySelector('[data-field="tokens"]');
  const contextEl = document.querySelector('[data-field="context"]');
  const nameEl = document.querySelector('[data-field="session-name"]');
  if (!tokensEl || !contextEl || !nameEl) return;

  const s = session || {};
  const totalTokens = (s.tokens_in ?? 0) + (s.tokens_out ?? 0);
  tokensEl.textContent =
    s.tokens_in == null && s.tokens_out == null ? T.sessionUnknown : formatTokens(totalTokens);

  contextEl.textContent = s.context_pct == null
    ? T.sessionUnknown
    : T.sessionContextTemplate
        .replace('{pct}', s.context_pct)
        .replace('{size}', formatTokens(s.context_size) ?? '?');

  nameEl.textContent = s.name ? `${T.sessionNamePrefix}${s.name}` : '';
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
  document.querySelector('[data-field="tokens-label"]').textContent = T.sessionTokens;
  document.querySelector('[data-field="context-label"]').textContent = T.sessionContext;
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
  reportHeight();
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
  renderSession(status.session);
  reportHeight();
}

// In glass mode the window is resized to match the panel, so every change that
// can alter the panel height has to report the new one: a refresh, and the
// disclosure opening or closing.
let PANEL_STYLE = 'solid';

function reportHeight() {
  if (PANEL_STYLE !== 'glass') return;
  const panel = document.querySelector('.panel');
  if (panel) window.panel.reportHeight(Math.ceil(panel.getBoundingClientRect().height));
}

document.addEventListener('DOMContentLoaded', async () => {
  [T, COLORS, PANEL_STYLE] = await Promise.all([
    window.i18n.strings(),
    window.palette.colors(),
    window.panel.style()
  ]);
  document.documentElement.dataset.panelStyle = PANEL_STYLE;
  document.addEventListener('toggle', (e) => {
    if (e.target instanceof HTMLDetailsElement) reportHeight();
  }, true); // capture: the toggle event does not bubble
  localizeStaticText();
  // Captured BEFORE the first refresh() on purpose, and only ever once. The
  // panel by then holds nothing but our own static markup, so the string that
  // ensureAvailableTemplate() later re-inserts as innerHTML can never contain
  // the session name, the model name or an error message — all of which come
  // from outside this app and are only ever written with textContent. Move
  // this line below refresh() and that stops being true.
  AVAILABLE_TEMPLATE = document.querySelector('.panel').innerHTML;

  refresh();
  setInterval(refresh, REFRESH_MS);
  window.quota.onForceRefresh(refresh);
});
