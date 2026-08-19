const fs = require('fs');
const path = require('path');
const os = require('os');

// User-editable, so it lives next to the other Claude-related dotfiles
// instead of Electron's less-discoverable userData folder.
const CONFIG_FILE = path.join(os.homedir(), '.claude', 'usage-app-config.json');

// Three independent pieces the tray can show, any subset (including
// none, which falls back to a plain neutral dot as the click target).
const VALID_TOKENS = ['bar', '5h', '7d'];

// How the popover paints itself. 'glass' is the default: macOS vibrancy, so the
// panel picks up whatever is behind the window and sits in the system the way
// Control Center does. 'solid' is the opaque fallback, an ordinary panel in the
// system colors — worth having for anyone who finds the translucency harder to
// read, and it is what non-macOS platforms would get if this were ever ported.
const VALID_PANEL_STYLES = ['glass', 'solid'];
// Optional wash of color over the panel, e.g. "#E0473C". Strictly #RRGGBB and
// nothing else: the value ends up inside a CSS custom property, and a strict
// shape check here means nothing config-borne can ever smuggle CSS along.
// The wash strength is fixed in the stylesheet on purpose — the semaphore
// bars carry meaning through color, so the tint must stay a background hint,
// never a competing voice.
const TINT_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_CONFIG = { trayDisplay: ['bar'], panelStyle: 'glass', panelTint: null };

// Accepts the pre-array single-mode strings too, so an existing config
// file never breaks silently after an update.
function normalizeTrayDisplay(value) {
  if (value === 'bar') return ['bar'];
  if (value === 'numbers') return ['5h', '7d'];
  if (value === 'both') return ['bar', '5h', '7d'];

  if (Array.isArray(value)) {
    const requested = new Set(value.filter((v) => VALID_TOKENS.includes(v)));
    // An explicit [] means "show nothing" and is respected as-is. An
    // array that had entries but none of them were valid tokens (e.g. a
    // typo) falls back to the default instead of silently going blank.
    if (value.length > 0 && requested.size === 0) return null;
    // Fixed, predictable order regardless of how the user wrote the array.
    return VALID_TOKENS.filter((t) => requested.has(t));
  }

  return null;
}

// Sync + re-read on every refresh: the file is tiny and this is the
// simplest way to pick up edits without requiring an app restart.
function readConfig() {
  let raw;
  try {
    raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  } catch {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const parsed = JSON.parse(raw);
    const trayDisplay = normalizeTrayDisplay(parsed.trayDisplay) ?? DEFAULT_CONFIG.trayDisplay;
    const panelStyle = VALID_PANEL_STYLES.includes(parsed.panelStyle)
      ? parsed.panelStyle
      : DEFAULT_CONFIG.panelStyle;
    const panelTint = typeof parsed.panelTint === 'string' && TINT_RE.test(parsed.panelTint)
      ? parsed.panelTint
      : null;
    return { trayDisplay, panelStyle, panelTint };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

module.exports = { readConfig, CONFIG_FILE, VALID_TOKENS, VALID_PANEL_STYLES };
