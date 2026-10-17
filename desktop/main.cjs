const { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess, Menu, session } = require('electron');
const { createServer } = require('node:http');
const { readFile, writeFile, stat } = require('node:fs/promises');
const { existsSync, mkdirSync, appendFileSync } = require('node:fs');
const { spawn } = require('node:child_process');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');
const { createUpdates } = require('./updates.cjs');
const testing = !!process.env.FORMA_DESKTOP_TEST_DATA;
const uiPort = testing ? 51862 : 51860, aiPort = testing ? 51863 : 51861;
const root = path.resolve(__dirname, '..'), origin = `http://127.0.0.1:${uiPort}`, aiOrigin = `http://127.0.0.1:${aiPort}`;
const captureToken = randomBytes(32).toString('hex');
let main, server, worker, login, closing = false, closePending = false, closeTimer, installPending = false;
const updates = createUpdates({ updater: autoUpdater, currentVersion: app.getVersion(), enabled: app.isPackaged && !process.env.FORMA_DESKTOP_TEST_DATA, onChange: state => { if (main && !main.isDestroyed()) main.webContents.send('forma:update-state', state); } });
if (process.env.FORMA_DESKTOP_TEST_DATA) app.setPath('userData', path.resolve(process.env.FORMA_DESKTOP_TEST_DATA));
app.setName('Forma Studio');
if (process.platform === 'win32') app.setAppUserModelId(testing ? 'studio.forma.desktop.test' : 'studio.forma.desktop');
if (!testing && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (main) { if (main.isMinimized()) main.restore(); main.show(); main.focus(); } });
  app.whenReady().then(start).catch(error => { dialog.showErrorBox('Forma could not start', error.message); app.quit(); });
}
function codexPath() {
  const triplet = `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-${process.platform === 'win32' ? 'pc-windows-msvc' : process.platform === 'darwin' ? 'apple-darwin' : 'unknown-linux-musl'}`;
  const unpacked = root.endsWith('app.asar') ? root + '.unpacked' : root;
  const binary = path.join(unpacked, 'node_modules', '@openai', `codex-${process.platform}-${process.arch}`, 'vendor', triplet, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
  if (!existsSync(binary)) throw new Error('The bundled AI engine is missing. Please reinstall Forma Studio.');
  return binary;
}
function trusted(event) {
  if (!main || event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error('Untrusted application request.');
}
function webAddress(value) { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; } }
function openExternal(url) { if (webAddress(url)) void shell.openExternal(url); }
async function startWorker() {
  if (worker) { const previous = worker; worker = null; previous.kill(); await new Promise(resolve => { previous.once('exit', resolve); setTimeout(resolve, 1500); }); }
  const runtime = path.join(app.getPath('userData'), 'runtime'); mkdirSync(runtime, { recursive: true });
  worker = utilityProcess.fork(path.join(root, 'server', 'designer.mjs'), [], {
    cwd: runtime, serviceName: 'Forma AI Designer', stdio: 'pipe',
    env: { ...process.env, FORMA_DATA_DIR: runtime, FORMA_AI_PORT: String(aiPort), FORMA_UI_ORIGIN: origin, FORMA_CODEX_BIN: codexPath(), FORMA_CAPTURE_ENDPOINT: origin + '/desktop/capture', FORMA_CAPTURE_TOKEN: captureToken },
  });
  const log = data => appendFileSync(path.join(runtime, 'designer.log'), data);
  worker.stdout?.on('data', log); worker.stderr?.on('data', log);
  for (let i = 0; i < 160; i++) {
    try { const r = await fetch(aiOrigin + '/health', { signal: AbortSignal.timeout(400) }); if (r.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('The local AI service could not start. Close another Forma instance, then use Restart AI. Your editor still works.');
}
async function capture(value) {
  const devices = JSON.parse(await readFile(path.join(root, 'shared', 'devices.json'), 'utf8'));
  const device = devices.find(item => item.id === value.device);
  if (!device || !webAddress(value.url)) throw new Error('Choose a supported device and HTTP or HTTPS address.');
  const isolated = session.fromPartition('forma-capture-' + randomBytes(12).toString('hex'));
  isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.on('will-download', event => event.preventDefault());
  isolated.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !['http:', 'https:', 'data:', 'blob:'].includes(new URL(details.url).protocol) }));
  const preview = new BrowserWindow({ show: false, width: device.viewport.width, height: device.viewport.height, useContentSize: true, webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  preview.webContents.on('will-navigate', (event, url) => { if (!webAddress(url)) event.preventDefault(); });
  let timer;
  try {
    await Promise.race([preview.loadURL(value.url), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('The website took too long. Try again or upload a screen image.')), 30000); })]);
    clearTimeout(timer);
    await preview.webContents.executeJavaScript('Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1200))]).then(() => true)');
    const image = await Promise.race([preview.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('The website could not be rendered. Try again or upload a screen image.')), 10000); })]);
    return { src: image.resize({ width: device.viewport.width, height: device.viewport.height }).toDataURL(), url: preview.webContents.getURL(), title: preview.webContents.getTitle().slice(0, 200), device: device.id, width: device.viewport.width, height: device.viewport.height, capturedAt: new Date().toISOString() };
  } finally { clearTimeout(timer); preview.destroy(); await isolated.clearStorageData(); }
}
async function startServer() {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
  const staticRoot = path.join(root, 'dist');
  server = createServer(async (req, res) => {
    try {
      if (req.headers.host !== `127.0.0.1:${uiPort}`) { res.writeHead(403); return res.end(); }
      const url = new URL(req.url, origin);
      if (url.pathname === '/desktop/capture' && req.method === 'POST') {
        const supplied = Buffer.from(String(req.headers['x-forma-capture'] || '')), expected = Buffer.from(captureToken);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { res.writeHead(403); return res.end(); }
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 5000) throw new Error('Invalid capture request.'); }
        const result = await capture(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(result));
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
      const file = path.resolve(staticRoot, decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html');
      if (!file.startsWith(staticRoot + path.sep)) { res.writeHead(403); return res.end(); }
      if (!(await stat(file)).isFile()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache',
        'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${aiOrigin}; worker-src 'self' blob:; media-src 'self' blob: data:; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
        'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      });
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.code === 'ENOENT' ? 'Not found' : error.message })); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(uiPort, '127.0.0.1', resolve); });
}
async function start() {
  await startServer();
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  main = new BrowserWindow({ width: 1560, height: 1040, minWidth: 900, minHeight: 650, title: 'Forma Studio', backgroundColor: '#f5f2f9', show: false, icon: path.join(root, 'desktop', 'icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), additionalArguments: [`--forma-ai-port=${aiPort}`], contextIsolation: true, sandbox: true, nodeIntegration: false } });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'Forma Studio', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'File', submenu: [{ label: 'Close', accelerator: 'Alt+F4', click: () => main.close() }] },
    { role: 'editMenu' }, { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
    { label: 'Help', submenu: [{ label: 'Check for updates', click: () => { main.webContents.send('forma:show-updates'); void updates.check(); } }, { label: 'Forma walkthrough', click: () => openExternal('https://github.com/postgigg/forma-studio#readme') }] },
  ]));
  main.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  main.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  main.webContents.on('will-attach-webview', event => event.preventDefault());
  main.once('ready-to-show', () => { if (!process.env.FORMA_DESKTOP_TEST_DATA) main.show(); });
  main.on('close', event => {
    if (closing) return;
    event.preventDefault(); if (closePending) return; closePending = true;
    main.webContents.send('forma:before-close'); closeTimer = setTimeout(() => void failedSave(), 10000);
  });
  ipcMain.on('forma:saved', (event, result) => { trusted(event); clearTimeout(closeTimer); if (result?.ok) { closing = true; if (installPending) updates.install(); else app.quit(); } else void failedSave(); });
  ipcMain.handle('forma:update-status', event => { trusted(event); return updates.getState(); });
  ipcMain.handle('forma:update-check', event => { trusted(event); main.webContents.send('forma:show-updates'); return updates.check(); });
  ipcMain.handle('forma:update-download', event => { trusted(event); return updates.download(); });
  ipcMain.handle('forma:update-install', event => { trusted(event); if (updates.getState().phase !== 'downloaded') throw new Error('The update is not ready to install.'); installPending = true; main.close(); return true; });
  ipcMain.handle('forma:restart-ai', async event => { trusted(event); await startWorker(); return true; });
  ipcMain.handle('forma:save-file', async (event, value) => {
    trusted(event);
    if (!value || typeof value.filename !== 'string' || !(value.bytes instanceof ArrayBuffer) || value.bytes.byteLength > 256 * 1024 * 1024) throw new Error('Invalid or oversized export.');
    const name = path.basename(value.filename).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
    const extension = path.extname(name).slice(1).toLowerCase();
    if (!['png','jpg','jpeg','svg','pdf','json','gif','webm','csv'].includes(extension)) throw new Error('Unsupported export format.');
    const choice = await dialog.showSaveDialog(main, { title: 'Save your Forma export', defaultPath: path.join(app.getPath('downloads'), name), filters: [{ name: extension.toUpperCase() + ' file', extensions: [extension] }], properties: ['showOverwriteConfirmation', 'createDirectory'] });
    if (choice.canceled || !choice.filePath) return false;
    await writeFile(choice.filePath, Buffer.from(value.bytes)); return true;
  });
  ipcMain.handle('forma:sign-in', async event => {
    trusted(event); if (login) throw new Error('Sign-in is already open in your browser.');
    await new Promise((resolve, reject) => {
      login = spawn(codexPath(), ['login'], { windowsHide: true, stdio: 'ignore', shell: false });
      const timeout = setTimeout(() => { login?.kill(); }, 180000);
      login.once('error', error => { clearTimeout(timeout); login = null; reject(error); });
      login.once('exit', code => { clearTimeout(timeout); login = null; code === 0 ? resolve() : reject(new Error('Sign-in was not completed. Try again from AI Designer.')); });
    });
    await startWorker(); return true;
  });
  await main.loadURL(origin);
  updates.start();
  void startWorker().catch(error => main.webContents.send('forma:ai-error', error.message));
}
async function failedSave() {
  clearTimeout(closeTimer); closePending = false;
  const result = await dialog.showMessageBox(main, { type: 'warning', buttons: ['Keep working', 'Close anyway'], defaultId: 0, cancelId: 0, title: 'Your latest changes may not be saved', message: 'Keep Forma open and export a Forma file to protect your work before closing.' });
  if (result.response === 1) { closing = true; if (installPending) updates.install(); else app.quit(); }
  else installPending = false;
}
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { updates.stop(); worker?.kill(); login?.kill(); server?.close(); });
