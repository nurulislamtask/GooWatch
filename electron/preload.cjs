const { contextBridge, ipcRenderer } = require('electron');

// Used by the blocking "Updating GooWatch" screen.
contextBridge.exposeInMainWorld('gwDesktop', {
  retryUpdate: () => ipcRenderer.send('gw-update-start'),
  onUpdate: (cb) => {
    const f = (_e, s) => cb(s);
    ipcRenderer.on('gw-update', f);
    ipcRenderer.send('gw-update-hello');
    return () => ipcRenderer.removeListener('gw-update', f);
  },
});
