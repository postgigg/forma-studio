const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { requiresMacLicense, bundledCodexPath, editCommands, menuTemplate, updatesEnabled, electronPackage, electronVersion } = require('../desktop/platform.cjs');

test('retail Mac activation cannot be bypassed by the desktop test environment', () => {
  for (const testing of [false, true]) {
    for (const macDistribution of ['signed', undefined]) {
      assert.equal(requiresMacLicense({ platform: 'darwin', packaged: true, macDistribution, testing }), true);
    }
    assert.equal(requiresMacLicense({ platform: 'darwin', packaged: true, macDistribution: 'development', testing }), false);
    assert.equal(requiresMacLicense({ platform: 'darwin', packaged: false, macDistribution: 'signed', testing }), false);
    assert.equal(requiresMacLicense({ platform: 'win32', packaged: true, testing }), false);
  }
});

test('Mac uses its Monterey-compatible runtime while Windows retains its existing runtime', () => {
  const pkg = require('../package.json');
  assert.equal(electronPackage('darwin'), 'electron-mac');
  assert.equal(electronPackage('win32'), 'electron');
  assert.equal(electronVersion(pkg, 'darwin'), '43.8.0');
  assert.equal(electronVersion(pkg, 'win32'), '44.7.2');
  assert.equal(pkg.build.mac.minimumSystemVersion, '12.0');
  assert.throws(() => electronVersion({ devDependencies: { electron: '^44.7.2' } }, 'win32'), /exact/);
});

test('Mac update downloads require a distribution build; Windows keeps its packaged update path', () => {
  assert.equal(updatesEnabled({ platform: 'darwin', packaged: true, testing: false, macDistribution: 'signed' }), true);
  for (const macDistribution of [undefined, 'development']) assert.equal(updatesEnabled({ platform: 'darwin', packaged: true, testing: false, macDistribution }), false);
  assert.equal(updatesEnabled({ platform: 'win32', packaged: true, testing: false }), true);
  for (const platform of ['darwin', 'win32']) {
    assert.equal(updatesEnabled({ platform, packaged: false, testing: false, macDistribution: 'signed' }), false);
    assert.equal(updatesEnabled({ platform, packaged: true, testing: true, macDistribution: 'signed' }), false);
  }
});

test('each desktop architecture resolves its own unpacked AI binary', () => {
  for (const [platform, arch, triplet, name] of [
    ['darwin', 'arm64', 'aarch64-apple-darwin', 'codex'],
    ['darwin', 'x64', 'x86_64-apple-darwin', 'codex'],
    ['win32', 'x64', 'x86_64-pc-windows-msvc', 'codex.exe'],
  ]) {
    for (const root of ['/development/forma', '/Applications/Forma Studio.app/Contents/Resources/app.asar']) {
      const unpacked = root.endsWith('.asar') ? root + '.unpacked' : root;
      assert.equal(bundledCodexPath(root, platform, arch), path.join(unpacked, 'node_modules', '@openai', `codex-${platform}-${arch}`, 'vendor', triplet, 'bin', name));
    }
  }
  assert.throws(() => bundledCodexPath('/app', 'darwin', 'ia32'), /Unsupported/);
});

for (const platform of ['darwin', 'win32']) {
  test(`${platform} menu routes all editing commands and uses the platform close shortcut`, () => {
    const received = []; let closed = 0;
    const template = menuTemplate({ platform, edit: command => received.push(command), close: () => closed++, checkForUpdates() {}, walkthrough() {} });
    const file = template.find(item => item.label === 'File').submenu[0];
    assert.equal(file.accelerator, platform === 'darwin' ? 'Cmd+W' : 'Alt+F4');
    file.click(); assert.equal(closed, 1);
    const commands = template.find(item => item.label === 'Edit').submenu.filter(item => item.click);
    commands.forEach(item => { assert.match(item.accelerator, /^CommandOrControl\+/); item.click(); });
    assert.deepEqual(received, editCommands);
    assert.equal(template.some(item => item.role === 'windowMenu'), platform === 'darwin');
    if (platform === 'darwin') {
      const roles = template[0].submenu.map(item => item.role);
      for (const role of ['about', 'services', 'hide', 'hideOthers', 'unhide', 'quit']) assert.ok(roles.includes(role));
    }
  });
}
