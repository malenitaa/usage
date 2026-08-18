const { app, Tray, Menu, BrowserWindow, ipcMain, screen, nativeTheme } = require('electron');
const path = require('path');

const { buildTrayIcon } = require('./icon');
const { readQuotaStatus, worstPct } = require('./quota-reader');
const { readConfig } = require('./config');
const { getStrings } = require('./i18n');
const { paletteForRenderer } = require('./palette');

const REFRESH_MS = 18000; // 15-20s per spec

let tray = null;
let popover = null;
let popoverStyle = null;
let refreshTimer = null;

// The raw figure can exceed 100: a request admitted just under the cap runs to
// completion and its full cost lands on the window afterwards. Anthropic's own
// usage screen caps what it shows at 100%, so cap it here too and stay
// consistent with claude.ai. The state file still stores the raw value.
function formatPct(pct) {
  return pct == null ? '?' : `${Math.min(pct, 100)}%`;
}

async function refreshTray() {
  const status = await readQuotaStatus();
  const pct = worstPct(status);
  const { trayDisplay } = readConfig();
  const showBar = trayDisplay.includes('bar');
  const show5h = trayDisplay.includes('5h');
  const show7d = trayDisplay.includes('7d');
  const t = getStrings();

  // The color-coded sparkle only draws when 'bar' is on; any other
  // combination (including none) falls back to a plain neutral dot so
  // there's always something in the menu bar to click.
  const icon = buildTrayIcon(pct, !!status.available, showBar);
  tray.setImage(icon);

  if (status.available && (show5h || show7d)) {
    const parts = [];
    if (show5h) parts.push(`5h ${formatPct(status.five_hour?.pct)}`);
    if (show7d) parts.push(`7d ${formatPct(status.seven_day?.pct)}`);
    tray.setTitle(parts.join(' · '));
  } else {
    tray.setTitle('');
  }

  if (status.available) {
    const tooltip = t.trayTooltipTemplate
      .replace('{fh}', formatPct(status.five_hour?.pct))
      .replace('{sd}', formatPct(status.seven_day?.pct));
    tray.setToolTip(tooltip);
  } else {
    tray.setToolTip(status.message || t.trayNoData);
  }
  return status;
}

// 'glass' uses macOS vibrancy, which is the only way to actually blur what is
// behind the window: CSS backdrop-filter only ever samples the page itself, and
// behind a transparent window there is no page, there is the desktop.
//
// Vibrancy paints the WHOLE window, so glass mode needs the window to match the
// panel exactly — hence the height reporting below. Solid mode keeps the
// oversized transparent window it already had, where the leftover space is
// invisible and the panel draws its own shadow in CSS.
function createPopover(panelStyle) {
  const glass = panelStyle === 'glass';
  const win = new BrowserWindow({
    width: 248,
    height: 332,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: !glass,
    ...(glass
      ? { vibrancy: 'popover', visualEffectState: 'active' }
      : { backgroundColor: '#00000000' }),
    // macOS draws a shadow (and rounds the corners of) the WINDOW, not the
    // panel painted inside it. In solid mode the window is deliberately larger
    // than the panel — it is sized for the tallest the panel ever gets, while
    // the panel's own height follows its content — so that native shadow showed
    // up as an empty rounded rectangle outlined around everything. There the
    // panel draws its own shadow in CSS, which tracks its real size. In glass
    // mode the window IS the panel, so macOS can shadow and round it correctly.
    hasShadow: glass,
    roundedCorners: glass,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Follow the user's current Space instead of pulling them over to
  // whichever Space the app happened to launch on. skipTransformProcessType
  // avoids Electron toggling the app between accessory/foreground to apply
  // this, which is what was causing macOS to switch Spaces on every click
  // (this window is transparent and the app is already a UIElement via
  // app.dock.hide(), exactly the case the option exists for).
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('blur', () => win.hide());

  // No legitimate reason for this fully-local popover to navigate or open
  // new windows/tabs — lock it down.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  return win;
}

function positionPopover() {
  const trayBounds = tray.getBounds();
  const winBounds = popover.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  let y = Math.round(trayBounds.y + trayBounds.height);

  x = Math.min(Math.max(x, display.workArea.x), display.workArea.x + display.workArea.width - winBounds.width);
  y = Math.min(y, display.workArea.y + display.workArea.height - winBounds.height);

  popover.setPosition(x, y, false);
}

function togglePopover() {
  // The two styles need different window flags (vibrancy cannot be switched on
  // an existing window), so a config change means building a new popover.
  const { panelStyle } = readConfig();
  if (popover && popoverStyle !== panelStyle) {
    popover.destroy();
    popover = null;
  }
  if (!popover) {
    popover = createPopover(panelStyle);
    popoverStyle = panelStyle;
  }

  if (popover.isVisible()) {
    popover.hide();
    return;
  }
  popover.webContents.send('force-refresh');
  positionPopover();
  popover.show();
  popover.focus();
}

app.whenReady().then(() => {
  // LSUIElement in Info.plist already keeps this out of the Dock from the very
  // first moment (so relaunching from Finder never drags the user to whichever
  // Space the app started on). This is the belt-and-braces path for `npm run
  // dev`, where the plist of the stock Electron binary is the one in effect.
  if (app.dock) app.dock.hide();
  Menu.setApplicationMenu(null);

  tray = new Tray(buildTrayIcon(0, false));
  tray.on('click', togglePopover);

  ipcMain.handle('quota:read', () => readQuotaStatus());
  ipcMain.handle('i18n:strings', () => getStrings());
  ipcMain.handle('palette:colors', () => paletteForRenderer());
  ipcMain.handle('config:panel-style', () => readConfig().panelStyle);

  // Glass mode only: the window must hug the panel so the vibrancy material
  // does not extend past it. The renderer measures itself because only it
  // knows how tall the content ended up (stale warnings, disclosure open).
  ipcMain.on('popover:height', (event, height) => {
    if (!popover || popover.isDestroyed() || popoverStyle !== 'glass') return;
    const h = Math.round(Number(height));
    if (!Number.isFinite(h) || h < 80 || h > 800) return; // ignore nonsense
    const b = popover.getBounds();
    if (b.height === h) return;
    popover.setBounds({ ...b, height: h });
    if (popover.isVisible()) positionPopover();
  });

  // macOS hands back different values for the same named system color in light
  // vs dark appearance, so the tray glyph has to be redrawn when the user
  // switches. The popover picks the new values up on its own next refresh.
  nativeTheme.on('updated', () => { if (tray) refreshTray(); });

  refreshTray();
  refreshTimer = setInterval(refreshTray, REFRESH_MS);
});

app.on('window-all-closed', (e) => {
  // Tray-only app: never quit just because the popover closed.
  e.preventDefault();
});

app.on('before-quit', () => {
  if (refreshTimer) clearInterval(refreshTimer);
});
