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
