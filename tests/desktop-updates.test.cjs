const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdates, compareVersions, readPolicy } = require('../desktop/updates.cjs');
const { checkMacRelease, releasesEndpoint } = require('../desktop/mac-releases.cjs');
function fixture(policy = async version => ({ version, minimumSupportedVersion: '1.3.0', message: 'Please update.' }), options = {}) {
  const updater = new EventEmitter(); let checks = 0, downloads = 0, installs = 0;
  updater.checkForUpdates = async () => { checks++; updater.emit('checking-for-update'); await new Promise(r => setTimeout(r, 3)); updater.emit('update-available', { version: '1.4.0' }); };
  updater.downloadUpdate = async () => { downloads++; updater.emit('download-progress', { percent: 51.2 }); await new Promise(r => setTimeout(r, 3)); updater.emit('update-downloaded', { version: '1.4.0' }); };
  updater.quitAndInstall = (silent, reopen) => { assert.equal(silent, false); assert.equal(reopen, true); installs++; };
  const events = [], updates = createUpdates({ updater, enabled: true, currentVersion: '1.2.0', policy, onChange: state => events.push(state), ...options });
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

function release(version, arch = 'x64') {
  const name = `Forma-Studio-${version}-${arch}.dmg`;
  return { tag_name: `v${version}`, draft: false, prerelease: false, assets: [{ name, size: 1024, state: 'uploaded', browser_download_url: `https://github.com/postgigg/forma-studio/releases/download/v${version}/${name}` }] };
}
const releasesResponse = (releases, headers) => new Response(JSON.stringify(releases), { headers });

test('Mac release checks find the newest published installer for the current architecture', async () => {
  const preview = { ...release('8.0.0'), prerelease: true };
  const draft = { ...release('9.0.0'), draft: true };
  const foreign = release('7.0.0'); foreign.assets[0].browser_download_url = 'https://example.com/app.dmg';
  const pending = release('6.0.0'); pending.assets[0].state = 'new';
  const releases = [release('1.9.0'), release('1.10.0'), release('2.0.0', 'arm64'), preview, draft, foreign, pending];
  for (const [arch, expected] of [['x64', '1.10.0'], ['arm64', '2.0.0']]) {
    let requests = 0;
    const result = await checkMacRelease({ currentVersion: '1.6.1', arch, fetcher: async (url, options) => {
      requests++; assert.equal(url, `${releasesEndpoint}?per_page=100&page=1`);
      assert.equal(options.headers['User-Agent'], 'Forma-Studio/1.6.1'); assert.ok(options.signal instanceof AbortSignal);
      return releasesResponse(releases);
    } });
    assert.equal(requests, 1); assert.equal(result.phase, 'available'); assert.equal(result.availableVersion, expected);
    assert.equal(result.releaseUrl, `https://github.com/postgigg/forma-studio/releases/tag/v${expected}`);
    assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
  }
});

test('a newer Windows release does not hide a published Mac update on another release page', async () => {
  const requests = [];
  const result = await checkMacRelease({ currentVersion: '1.6.1', arch: 'x64', fetcher: async url => {
    requests.push(url);
    if (requests.length === 1) return releasesResponse([{ ...release('2.0.0'), assets: [] }], { link: '<https://api.github.com/ignored>; rel="next"' });
    return releasesResponse([release('1.7.0')]);
  } });
  assert.equal(result.availableVersion, '1.7.0');
  assert.deepEqual(requests, [1, 2].map(page => `${releasesEndpoint}?per_page=100&page=${page}`));
});

test('current, older and other-architecture downloads do not invent a newer Mac update', async () => {
  const result = await checkMacRelease({ currentVersion: '1.6.1', arch: 'x64', fetcher: async () => releasesResponse([release('1.6.1'), release('1.5.0'), release('1.7.0', 'arm64'), { ...release('1.8.0'), assets: [] }]) });
  assert.equal(result.phase, 'idle'); assert.equal(result.availableVersion, ''); assert.equal(result.releaseUrl, '');
  assert.match(result.message, /No newer Mac release is published/); assert.match(result.message, /1\.6\.1/);
});

test('network errors, rate limits and malformed release responses cannot claim a completed check', async () => {
  for (const fetcher of [async () => { throw new Error('offline'); }, async () => new Response('', { status: 403 }), async () => releasesResponse({ message: 'unexpected' }), async () => new Response('not JSON'), async () => { throw new DOMException('timed out', 'TimeoutError'); }]) {
    await assert.rejects(checkMacRelease({ currentVersion: '1.6.1', arch: 'x64', fetcher }));
  }
});

test('manual Mac checks publish checking and availability, coalesce requests and never invoke the installer', async () => {
  let requests = 0, complete;
  const f = fixture(undefined, { enabled: false, releaseCheck: () => checkMacRelease({ currentVersion: '1.2.0', arch: 'x64', fetcher: () => { requests++; return new Promise(resolve => { complete = resolve; }); } }) });
  assert.equal(f.updates.getState().phase, 'idle'); assert.equal(f.updates.getState().canInstall, false);
  const first = f.updates.check(), second = f.updates.check();
  await Promise.resolve(); assert.equal(f.updates.getState().phase, 'checking'); assert.equal(requests, 1);
  complete(releasesResponse([release('1.4.0')])); await Promise.all([first, second]);
  assert.equal(f.updates.getState().availableVersion, '1.4.0'); assert.equal(f.updates.getState().canInstall, false);
  assert.ok(f.events.some(state => state.phase === 'checking'));
  await assert.rejects(f.updates.download()); assert.throws(() => f.updates.install());
  assert.deepEqual(f.counts(), { checks: 0, downloads: 0, installs: 0 });
});

test('a failed manual check remains retryable and a successful retry clears stale release details', async () => {
  let requests = 0;
  const f = fixture(undefined, { enabled: false, releaseCheck: () => checkMacRelease({ currentVersion: '1.2.0', arch: 'x64', fetcher: async () => {
    requests++; if (requests === 1) throw new Error('offline');
    return releasesResponse(requests === 2 ? [release('1.4.0')] : []);
  } }) });
  await f.updates.check(); assert.equal(f.updates.getState().phase, 'error'); assert.match(f.updates.getState().message, /try again later/);
  await f.updates.check(); assert.equal(f.updates.getState().phase, 'available');
  await f.updates.check(); assert.equal(f.updates.getState().phase, 'idle'); assert.equal(f.updates.getState().releaseUrl, ''); assert.equal(requests, 3);
});
