const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('formaDesktop', {
  aiEndpoint: 'http://127.0.0.1:51861',
  signIn: () => ipcRenderer.invoke('forma:sign-in'),
  restartAI: () => ipcRenderer.invoke('forma:restart-ai'),
  saveFile: (filename, bytes) => ipcRenderer.invoke('forma:save-file', { filename, bytes }),
  onBeforeClose: callback => {
    const handler = async () => {
      try { await callback(); ipcRenderer.send('forma:saved', { ok: true }); }
      catch { ipcRenderer.send('forma:saved', { ok: false }); }
    };
    ipcRenderer.on('forma:before-close', handler);
    return () => ipcRenderer.removeListener('forma:before-close', handler);
  },
});
