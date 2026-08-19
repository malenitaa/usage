const { contextBridge, ipcRenderer } = require('electron');

// The ONLY surface exposed to the renderer: a single read-only function.
// No generic fs, no ipcRenderer passthrough, no node globals.
contextBridge.exposeInMainWorld('quota', {
  read: () => ipcRenderer.invoke('quota:read'),
  onForceRefresh: (callback) => ipcRenderer.on('force-refresh', callback)
});

contextBridge.exposeInMainWorld('i18n', {
  strings: () => ipcRenderer.invoke('i18n:strings')
});

contextBridge.exposeInMainWorld('palette', {
  // Re-read on every refresh rather than cached once, so switching the system
  // between light and dark appearance is picked up without a restart.
  colors: () => ipcRenderer.invoke('palette:colors')
});

contextBridge.exposeInMainWorld('panel', {
  style: () => ipcRenderer.invoke('config:panel-style'),
  tint: () => ipcRenderer.invoke('config:panel-tint'),
  // Glass mode needs the window to hug the panel, and only the renderer knows
  // how tall the content ended up. Send-only and clamped on the main side.
  reportHeight: (height) => ipcRenderer.send('popover:height', height)
});
