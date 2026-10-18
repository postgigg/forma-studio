const { compareVersions } = require('./updates.cjs');

const repository = 'https://github.com/postgigg/forma-studio';
const releasesEndpoint = 'https://api.github.com/repos/postgigg/forma-studio/releases';

async function checkMacRelease({ currentVersion, arch = process.arch, fetcher = globalThis.fetch }) {
  compareVersions(currentVersion, currentVersion);
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Unsupported Mac architecture.');
  const signal = AbortSignal.timeout(10000);
  let newest;
  for (let page = 1; page <= 10; page++) {
    const response = await fetcher(`${releasesEndpoint}?per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Forma-Studio/${currentVersion}` },
      cache: 'no-store', signal,
    });
    if (!response.ok) throw new Error(`GitHub release check failed (${response.status}).`);
    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error('Invalid GitHub release response.');
    for (const release of releases) {
      const version = /^v?(\d{1,5}\.\d{1,5}\.\d{1,5})$/.exec(release?.tag_name)?.[1];
      if (!version || release.draft !== false || release.prerelease !== false || compareVersions(version, currentVersion) <= 0 || !Array.isArray(release.assets)) continue;
      const hasDownload = release.assets.some(asset => ['dmg', 'zip'].some(extension => {
        const name = `Forma-Studio-${version}-${arch}.${extension}`;
        return asset?.name === name && asset.state === 'uploaded' && asset.size > 0 && asset.browser_download_url === `${repository}/releases/download/${release.tag_name}/${name}`;
      }));
      if (hasDownload && (!newest || compareVersions(version, newest.version) > 0)) newest = { version, tag: release.tag_name };
    }
    if (!response.headers.get('link')?.includes('rel="next"')) {
      return {
        phase: newest ? 'available' : 'idle', availableVersion: newest?.version || '',
        releaseUrl: newest ? `${repository}/releases/tag/${newest.tag}` : '',
        checkedAt: new Date().toISOString(),
        message: newest
          ? `Forma ${newest.version} has an ${arch === 'x64' ? 'Intel' : 'Apple Silicon'} Mac download. View the release for installation details.`
          : `No newer Mac release is published. You’re using Forma ${currentVersion}.`,
      };
    }
  }
  throw new Error('GitHub returned too many release pages to finish this check.');
}

module.exports = { checkMacRelease, releasesEndpoint };
