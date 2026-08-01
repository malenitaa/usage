const { app, Tray, Menu, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const { buildTrayIcon } = require('./icon');
const { readQuotaStatus, worstPct } = require('./quota-reader');

const REFRESH_MS = 18000; // 15-20s per spec

let tray = null;
let popover = null;
let refreshTimer = null;

function formatPct(pct) {
  return pct == null ? '?' : `${pct}%`;
}

async function refreshTray() {
  const status = await readQuotaStatus();
  const pct = worstPct(status);
  const icon = buildTrayIcon(pct, !!status.available);
  tray.setImage(icon);

  if (status.available) {
    tray.setToolTip(`Claude usage — 5h: ${formatPct(status.five_hour?.pct)}  7d: ${formatPct(status.seven_day?.pct)}`);
  } else {
    tray.setToolTip(status.message || 'Claude usage: sin datos');
  }
  return status;
}

function createPopover() {
  const win = new BrowserWindow({
    width: 280,
    height: 250,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

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
  if (!popover) popover = createPopover();

  if (popover.isVisible()) {
    popover.hide();
    return;
  }
  positionPopover();
  popover.show();
  popover.focus();
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  Menu.setApplicationMenu(null);

  tray = new Tray(buildTrayIcon(0, false));
  tray.on('click', togglePopover);

  ipcMain.handle('quota:read', () => readQuotaStatus());

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
