const { contextBridge, ipcRenderer } = require('electron');
const aiPort = process.argv.includes('--forma-ai-port=51863') ? 51863 : 51861;
contextBridge.exposeInMainWorld('formaDesktop', {
  aiEndpoint: `http://127.0.0.1:${aiPort}`,
  signIn: () => ipcRenderer.invoke('forma:sign-in'),
  restartAI: () => ipcRenderer.invoke('forma:restart-ai'),
  saveFile: (filename, bytes) => ipcRenderer.invoke('forma:save-file', { filename, bytes }),
  updateStatus: () => ipcRenderer.invoke('forma:update-status'),
  checkForUpdates: () => ipcRenderer.invoke('forma:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('forma:update-download'),
  installUpdate: () => ipcRenderer.invoke('forma:update-install'),
  onUpdateState: callback => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('forma:update-state', handler);
    return () => ipcRenderer.removeListener('forma:update-state', handler);
  },
  onShowUpdates: callback => {
    const handler = () => callback();
    ipcRenderer.on('forma:show-updates', handler);
    return () => ipcRenderer.removeListener('forma:show-updates', handler);
  },
  onBeforeClose: callback => {
    const handler = async () => {
      try { await callback(); ipcRenderer.send('forma:saved', { ok: true }); }
      catch { ipcRenderer.send('forma:saved', { ok: false }); }
    };
    ipcRenderer.on('forma:before-close', handler);
    return () => ipcRenderer.removeListener('forma:before-close', handler);
  },
});
