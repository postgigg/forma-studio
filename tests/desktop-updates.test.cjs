const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdates, compareVersions, readPolicy } = require('../desktop/updates.cjs');
function fixture(policy = async version => ({ version, minimumSupportedVersion: '1.3.0', message: 'Please update.' })) {
  const updater = new EventEmitter(); let checks = 0, downloads = 0, installs = 0;
  updater.checkForUpdates = async () => { checks++; updater.emit('checking-for-update'); await new Promise(r => setTimeout(r, 3)); updater.emit('update-available', { version: '1.4.0' }); };
  updater.downloadUpdate = async () => { downloads++; updater.emit('download-progress', { percent: 51.2 }); await new Promise(r => setTimeout(r, 3)); updater.emit('update-downloaded', { version: '1.4.0' }); };
  updater.quitAndInstall = (silent, reopen) => { assert.equal(silent, false); assert.equal(reopen, true); installs++; };
  const events = [], updates = createUpdates({ updater, enabled: true, currentVersion: '1.2.0', policy, onChange: state => events.push(state) });
  return { updates, updater, events, counts: () => ({ checks, downloads, installs }) };
}
test('stable versions compare numerically, with invalid versions rejected', () => { assert.equal(compareVersions('1.10.0', '1.2.0'), 1); assert.equal(compareVersions('1.2.0', '1.2.0'), 0); assert.throws(() => compareVersions('latest', '1.2.0')); });
test('required status is tied to the exact available release and a valid minimum', () => {
  assert.equal(readPolicy({ version: '1.4.0', minimumSupportedVersion: '1.3.0' }, '1.2.0', '1.4.0').required, true);
  for (const value of [null, { version: '1.5.0', minimumSupportedVersion: '1.3.0' }, { version: '1.4.0', minimumSupportedVersion: '9.0.0' }, { version: '1.4.0', minimumSupportedVersion: 'bad' }]) assert.equal(readPolicy(value, '1.2.0', '1.4.0').required, false);
});
test('checking never downloads or installs, and overlapping checks are coalesced', async () => { const f = fixture(); await Promise.all([f.updates.check(), f.updates.check()]); assert.deepEqual(f.counts(), { checks: 1, downloads: 0, installs: 0 }); assert.equal(f.updates.getState().required, true); assert.equal(f.updater.autoInstallOnAppQuit, false); assert.equal(f.updater.autoDownload, false); });
test('download needs an available release; installation needs a finished download and explicit action', async () => { const f = fixture(); await assert.rejects(f.updates.download()); assert.throws(() => f.updates.install()); await f.updates.check(); await Promise.all([f.updates.download(), f.updates.download()]); assert.equal(f.updates.getState().phase, 'downloaded'); assert.ok(f.events.some(e => e.percent === 51.2)); assert.deepEqual(f.counts(), { checks: 1, downloads: 1, installs: 0 }); f.updates.install(); assert.equal(f.counts().installs, 1); });
test('offline and malformed policy keep the editor usable and do not falsely force an update', async () => { const f = fixture(async () => { throw new Error('offline'); }); await f.updates.check(); await new Promise(r => setTimeout(r, 5)); assert.equal(f.updates.getState().required, false); f.updater.checkForUpdates = async () => { throw new Error('network unavailable'); }; await f.updates.check(); assert.equal(f.updates.getState().phase, 'error'); assert.match(f.updates.getState().message, /keep working offline/); });
test('download errors are recoverable and cannot trigger installation', async () => { const f = fixture(); await f.updates.check(); f.updater.downloadUpdate = async () => { throw new Error('checksum mismatch'); }; await f.updates.download(); assert.equal(f.updates.getState().phase, 'error'); assert.throws(() => f.updates.install()); assert.equal(f.counts().installs, 0); });
