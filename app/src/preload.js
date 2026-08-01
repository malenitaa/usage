const { contextBridge, ipcRenderer } = require('electron');

// The ONLY surface exposed to the renderer: a single read-only function.
// No generic fs, no ipcRenderer passthrough, no node globals.
contextBridge.exposeInMainWorld('quota', {
  read: () => ipcRenderer.invoke('quota:read')
});
