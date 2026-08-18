// Semaphore palette, resolved from macOS's own system colors so the app
// follows whatever the OS is using (including the shifts macOS makes between
// light and dark appearance) instead of hardcoding a look of its own.
// Thresholds are on the WORST of five_hour.pct / seven_day.pct.
const { systemPreferences, nativeTheme } = require('electron');

// Used verbatim off macOS and if the API ever fails. These are Apple's
// published light-appearance values for the same three colors, so the app
// still looks right rather than falling back to something arbitrary.
const FALLBACK = {
  green: '#34C759',
  yellow: '#FFCC00',
  red: '#FF3B30',
  gray: '#8E8E93'
};

function parseHex(hex) {
  // getSystemColor returns 8 digits (RRGGBBAA); the alpha is always FF for
  // these and the icon renderer wants plain RGB.
  const clean = hex.replace('#', '').slice(0, 6);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ];
}

// macOS returns different values for the same named color in light vs dark
// appearance, so the cache is keyed on the current appearance and refreshes
// itself when the user switches.
let cache = null;
let cacheKey = null;

function systemColors() {
  const key = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  if (cache && cacheKey === key) return cache;

  const resolve = (name) => {
    let hex = FALLBACK[name];
    try {
      hex = systemPreferences.getSystemColor(name) || hex;
    } catch {
      // Non-macOS, or the API is unavailable: keep the fallback.
    }
    return { hex: `#${hex.replace('#', '').slice(0, 6).toUpperCase()}`, rgb: parseHex(hex) };
  };

  cache = {
    green: resolve('green'),
    yellow: resolve('yellow'),
    red: resolve('red'),
    gray: resolve('gray')
  };
  cacheKey = key;
  return cache;
}

function colorForPct(pct) {
  const c = systemColors();
  if (pct == null) return c.gray;
  if (pct >= 80) return c.red;
  if (pct >= 50) return c.yellow;
  return c.green;
}

// Tier name for the renderer, kept separate from the color itself so the
// popover and the tray icon can never disagree about where the cutoffs are.
function tierForPct(pct) {
  if (pct == null) return 'none';
  if (pct >= 80) return 'red';
  if (pct >= 50) return 'yellow';
  return 'green';
}

// Sent to the renderer over IPC (plain strings only — IPC can't carry
// functions, same constraint as the i18n dictionary).
function paletteForRenderer() {
  const c = systemColors();
  return { green: c.green.hex, yellow: c.yellow.hex, red: c.red.hex, none: c.gray.hex };
}

module.exports = { colorForPct, tierForPct, paletteForRenderer };
