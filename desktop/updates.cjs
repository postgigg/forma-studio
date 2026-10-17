const stable = value => typeof value === 'string' && /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value);
function compareVersions(a, b) {
  if (!stable(a) || !stable(b)) throw new Error('Invalid stable version.');
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  return 0;
}
function readPolicy(value, currentVersion, availableVersion) {
  if (!value || value.version !== availableVersion || !stable(value.minimumSupportedVersion) || !stable(currentVersion) || !stable(availableVersion)) return { required: false, reason: '' };
  if (compareVersions(value.minimumSupportedVersion, availableVersion) > 0) return { required: false, reason: '' };
  return { required: compareVersions(currentVersion, value.minimumSupportedVersion) < 0, reason: typeof value.message === 'string' ? value.message.slice(0, 300) : '' };
}
async function fetchPolicy(version) {
  if (!stable(version)) return null;
  const response = await fetch(`https://github.com/postgigg/forma-studio/releases/download/v${version}/update-policy.json`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  const text = await response.text();
  if (text.length > 8192) return null;
  return JSON.parse(text);
}
function createUpdates({ updater, currentVersion, enabled, onChange, policy = fetchPolicy, releaseCheck }) {
  let state = { phase: enabled || releaseCheck ? 'idle' : 'unsupported', currentVersion, availableVersion: '', required: false, reason: '', percent: 0, canInstall: enabled, releaseUrl: '', message: !enabled && releaseCheck ? 'Check GitHub for a newer Mac release.' : '' };
  let checking, downloading, startup, interval;
  const publish = patch => { state = { ...state, ...patch }; onChange({ ...state }); return { ...state }; };
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.disableWebInstaller = true;
  updater.on('checking-for-update', () => publish({ phase: 'checking', message: '' }));
  updater.on('update-available', info => {
    if (!stable(info.version) || compareVersions(info.version, currentVersion) <= 0) return;
    publish({ phase: 'available', availableVersion: info.version, required: false, reason: '', percent: 0, message: '' });
    void policy(info.version).then(value => {
      if (state.availableVersion === info.version) publish(readPolicy(value, currentVersion, info.version));
    }).catch(() => {});
  });
  updater.on('update-not-available', () => publish({ phase: 'idle', availableVersion: '', required: false, reason: '', message: 'You have the latest version.' }));
  updater.on('download-progress', info => publish({ phase: 'downloading', percent: Math.max(0, Math.min(100, Number(info.percent) || 0)) }));
  updater.on('update-downloaded', info => publish({ phase: 'downloaded', availableVersion: info.version, percent: 100, message: '' }));
  updater.on('error', () => publish({ phase: 'error', message: 'The update could not finish. Check your connection and try again. Your designs are safe on this device.' }));
  async function check() {
    if ((!enabled && !releaseCheck) || ['downloading', 'downloaded'].includes(state.phase)) return { ...state };
    if (checking) return checking;
    checking = Promise.resolve().then(async () => {
      publish({ phase: 'checking', message: '', ...(!enabled ? { availableVersion: '', releaseUrl: '', required: false, reason: '', checkedAt: '' } : {}) });
      if (enabled) await updater.checkForUpdates();
      else publish(await releaseCheck());
    }).catch(() => publish({ phase: 'error', message: 'Could not check for updates. You can keep working offline and try again later.' })).then(() => ({ ...state })).finally(() => { checking = null; });
    return checking;
  }
  async function download() {
    if (downloading) return downloading;
    if (!enabled || !state.availableVersion || !['available', 'error'].includes(state.phase)) throw new Error('Check for an available update first.');
    publish({ phase: 'downloading', percent: 0, message: '' });
    downloading = updater.downloadUpdate().then(() => ({ ...state })).catch(() => publish({ phase: 'error', message: 'The download could not finish. Your current version still works. Try the download again.' })).finally(() => { downloading = null; });
    return downloading;
  }
  return {
    getState: () => ({ ...state }), check, download,
    install() { if (!enabled || state.phase !== 'downloaded') throw new Error('Download the update before restarting.'); updater.quitAndInstall(false, true); },
    start() { if (!enabled) return; startup = setTimeout(() => void check(), 12000); startup.unref?.(); interval = setInterval(() => void check(), 6 * 60 * 60 * 1000); interval.unref?.(); },
    stop() { clearTimeout(startup); clearInterval(interval); },
  };
}
module.exports = { createUpdates, compareVersions, readPolicy };
