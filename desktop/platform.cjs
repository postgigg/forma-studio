const path = require('node:path');

const editCommands = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'];

function electronPackage(platform = process.platform) {
  return platform === 'darwin' ? 'electron-mac' : 'electron';
}

function electronVersion(pkg, platform = process.platform) {
  const name = electronPackage(platform), spec = pkg.devDependencies[name];
  const match = /^(?:npm:electron@)?(\d+\.\d+\.\d+)$/.exec(spec || '');
  if (!match) throw new Error(`Pin an exact ${name} runtime version in package.json.`);
  return match[1];
}

function updatesEnabled({ platform, packaged, testing, macDistribution }) {
  return packaged && !testing && (platform !== 'darwin' || macDistribution === 'signed');
}

function bundledCodexPath(root, platform = process.platform, arch = process.arch) {
  const targets = { darwin: 'apple-darwin', win32: 'pc-windows-msvc', linux: 'unknown-linux-musl' };
  if (!targets[platform] || !['x64', 'arm64'].includes(arch)) throw new Error('Unsupported desktop platform or architecture.');
  const triplet = `${arch === 'arm64' ? 'aarch64' : 'x86_64'}-${targets[platform]}`;
  const unpacked = root.endsWith('app.asar') ? root + '.unpacked' : root;
  return path.join(unpacked, 'node_modules', '@openai', `codex-${platform}-${arch}`, 'vendor', triplet, 'bin', platform === 'win32' ? 'codex.exe' : 'codex');
}

function menuTemplate({ platform = process.platform, edit, close, checkForUpdates, walkthrough }) {
  const mac = platform === 'darwin';
  const command = (label, action, accelerator) => ({ id: `edit-${action}`, label, accelerator, click: () => edit(action) });
  return [
    ...(mac ? [{ label: 'Forma Studio', submenu: [
      { role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
    ] }] : []),
    { label: 'File', submenu: [{ id: 'close-window', label: 'Close', accelerator: mac ? 'Cmd+W' : 'Alt+F4', click: close }] },
    { label: 'Edit', submenu: [
      command('Undo', 'undo', 'CommandOrControl+Z'), command('Redo', 'redo', 'CommandOrControl+Shift+Z'),
      { type: 'separator' }, command('Cut', 'cut', 'CommandOrControl+X'), command('Copy', 'copy', 'CommandOrControl+C'),
      command('Paste', 'paste', 'CommandOrControl+V'), { type: 'separator' }, command('Select all', 'selectAll', 'CommandOrControl+A'),
    ] },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
    ...(mac ? [{ role: 'windowMenu' }] : []),
    { label: 'Help', submenu: [{ label: 'Check for updates', click: checkForUpdates }, { label: 'Forma walkthrough', click: walkthrough }] },
  ];
}

module.exports = { bundledCodexPath, editCommands, menuTemplate, updatesEnabled, electronPackage, electronVersion };
