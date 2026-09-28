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
  // Past a day, raw hours make the reader do the division ("76h... /24?"):
  // switch to days + hours and append the actual weekday and time it lands
  // on, in the system locale. Under a day, hours + minutes as always.
  if (diffSeconds >= 86400) {
    const days = Math.floor(diffSeconds / 86400);
    const hours = Math.floor((diffSeconds % 86400) / 3600);
    const when = new Date(resetsAtEpochSeconds * 1000).toLocaleString([], {
      weekday: 'short', hour: '2-digit', minute: '2-digit'
    });
    return T.resetInDaysTemplate.replace('{d}', days).replace('{h}', hours).replace('{when}', when);
  }
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  return T.resetInTemplate.replace('{h}', hours).replace('{m}', minutes);
}

function formatUpdated(writtenAtEpochSeconds) {
  if (writtenAtEpochSeconds == null) return T.updatedUnknown;
  const d = new Date(writtenAtEpochSeconds * 1000);
  return `${T.updatedPrefix}${d.toLocaleTimeString()}`;
}

// Every element is created and filled with textContent — account ids, like
// session names, come from outside this app and must never travel as HTML.
function buildMeter(label, win) {
  const section = document.createElement('section');
  section.className = 'meter';

  const row = document.createElement('div');
  row.className = 'meter-row';
  const labelEl = document.createElement('span');
  labelEl.className = 'meter-label';
  labelEl.textContent = label;
  const pctEl = document.createElement('span');
  pctEl.className = 'meter-pct';
  const pct = win?.pct ?? null;
  // Capped at 100 to match Anthropic's own usage screen — see formatPct() in
  // main.js for why the raw number can go above it.
  pctEl.textContent = pct == null ? '--%' : `${Math.min(pct, 100)}%`;
  row.append(labelEl, pctEl);

  const track = document.createElement('div');
  track.className = 'bar-track';
  const fill = document.createElement('div');
  fill.className = 'bar-fill';
  track.appendChild(fill);
  renderBar(fill, pct);

  const reset = document.createElement('div');
  reset.className = 'meter-reset';
  reset.textContent = formatCountdown(win?.resets_at ?? null);

  section.append(row, track, reset);
  if (win?.stale_suspect) {
    const stale = document.createElement('div');
    stale.className = 'meter-stale';
    stale.textContent = T.staleSuspect;
    section.appendChild(stale);
  }
  return section;
}

// Each account gets a header naming it plus its own two bars — also when
// there is only one: on a machine where accounts come and go, an unnamed
// pair of bars forces the reader to guess whose usage this is. The header
// shows the email's local part (the full address is the tooltip): two of
// anyone's accounts usually differ before the @, and the domain is the
// least interesting pixel-hungry half. Only a legacy accountless entry
// (schema-1 file) renders bare, like the panel always did.
function renderAccounts(accounts) {
  const container = document.getElementById('accounts');
  container.replaceChildren();
  for (const acct of accounts) {
    if (acct.account) {
      const header = document.createElement('div');
      header.className = 'account-header';
      const id = acct.account || T.accountUnknown;
      header.textContent = id.includes('@') ? id.split('@')[0] : id;
      header.title = id;
      // Account usage is real even with every session closed (the windows
      // keep burning down server-side), but a reading nobody has refreshed
      // in a while is a photo, not a feed — say when it was taken, so a
      // frozen number can never pass for a live one.
      if (acct.written_at != null && Math.floor(Date.now() / 1000) - acct.written_at > 120) {
        const asOf = document.createElement('span');
        asOf.className = 'account-updated';
        const d = new Date(acct.written_at * 1000);
        asOf.textContent = `· ${T.accountAsOfPrefix}${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        header.appendChild(asOf);
      }
      container.appendChild(header);
    }
    container.appendChild(buildMeter('5H', acct.five_hour));
    container.appendChild(buildMeter('7D', acct.seven_day));
  }
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
  if (!panel.querySelector('#accounts')) panel.innerHTML = AVAILABLE_TEMPLATE;
}

async function refresh() {
  const [status, colors] = await Promise.all([window.quota.read(), window.palette.colors()]);
  COLORS = colors;

  if (!status || !status.available) {
    renderUnavailable(status && status.message);
    return;
  }

  ensureAvailableTemplate();
  renderAccounts(status.accounts?.length
    ? status.accounts
    : [{ account: null, five_hour: status.five_hour, seven_day: status.seven_day }]);
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
  let tint;
  [T, COLORS, PANEL_STYLE, tint] = await Promise.all([
    window.i18n.strings(),
    window.palette.colors(),
    window.panel.style(),
    window.panel.tint()
  ]);
  document.documentElement.dataset.panelStyle = PANEL_STYLE;
  // Already validated as #RRGGBB on the main side; a change of tint rebuilds
  // the whole popover (see togglePopover), so reading it once here is enough.
  if (tint) {
    document.documentElement.style.setProperty('--panel-tint', tint);
    document.documentElement.dataset.tinted = 'true';
  }
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
