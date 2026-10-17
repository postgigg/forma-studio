const { randomBytes } = require('node:crypto');

// Use the Electron browser already shipped in the app, in a partition with no
// workspace storage, preload, Node access, permissions or external requests.
async function renderProposal({ BrowserWindow, session, origin, proposal, signal }) {
  if (signal?.aborted) throw new Error('Cancelled.');
  const { validateProposal, validateDesignAssets } = await import('../server/contract.mjs');
  const extraAssets = validateDesignAssets(proposal?.extraAssets || []);
  const value = { ...validateProposal(proposal, extraAssets), extraAssets };
  if (signal?.aborted) throw new Error('Cancelled.');
  const isolated = session.fromPartition('forma-review-' + randomBytes(12).toString('hex'));
  isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.on('will-download', event => event.preventDefault());
  isolated.webRequest.onBeforeRequest((details, callback) => {
    const address = new URL(details.url);
    callback({ cancel: address.origin !== origin && !['data:', 'blob:'].includes(address.protocol) });
  });
  const preview = new BrowserWindow({ show: false, webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  preview.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  const abort = () => preview.destroy();
  signal?.addEventListener('abort', abort, { once: true });
  let timer;
  try {
    return await Promise.race([
      (async () => {
        await preview.loadURL(origin + '/?forma-render=1');
        return preview.webContents.executeJavaScript(`(async () => {
          const deadline = Date.now() + 15000;
          while (typeof window.__formaRenderProposal !== 'function') {
            if (Date.now() > deadline) throw new Error('The design preview could not start.');
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          return window.__formaRenderProposal(${JSON.stringify(value)});
        })()`);
      })(),
      new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('The design preview took too long.')), 45000); }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    if (!preview.isDestroyed()) preview.destroy();
    await isolated.clearStorageData();
  }
}

module.exports = { renderProposal };
