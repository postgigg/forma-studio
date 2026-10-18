import { expect } from '@playwright/test';
import path from 'node:path';

export async function checkUpdateDialog({ app, page, folder, currentVersion, live = false }) {
  const dialog = page.locator('.desktop-update-dialog');
  const openFromHelp = async () => {
    await page.getByTitle('Help & shortcuts', { exact: true }).click();
    await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await expect(dialog).toBeVisible();
  };
  const openFromMenu = () => app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label === 'Help').submenu.items.find(item => item.label === 'Check for updates').click());
  const status = () => page.evaluate(() => window.formaDesktop.updateStatus());
  if (process.platform !== 'darwin') {
    expect((await status()).phase).toBe('unsupported');
    await openFromHelp();
    await expect(dialog).toContainText('Update checks aren’t available for this build yet.');
    await dialog.getByRole('button', { name: 'Keep working', exact: true }).click();
    await openFromMenu(); await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep working', exact: true }).click();
    return { manualReleaseCheck: false, liveUpdateCheck: null };
  }
  expect((await status()).phase).toBe('idle');
  expect((await status()).canInstall).toBe(false);
  // Intercept only the main process's public release feed. No release assets or
  // installers are downloaded, and the renderer uses the real desktop bridge.
  await app.evaluate(() => {
    const proof = globalThis.formaReleaseProof = { original: globalThis.fetch, requests: [], pending: [] };
    globalThis.fetch = (url, options) => {
      if (typeof url === 'string' && url.startsWith('https://api.github.com/repos/postgigg/forma-studio/releases?')) {
        proof.requests.push(url);
        return new Promise((resolve, reject) => proof.pending.push({ resolve, reject }));
      }
      return proof.original(url, options);
    };
  });
  const complete = (releases = [], offline = false) => app.evaluate((_, { releases, offline }) => {
    const request = globalThis.formaReleaseProof.pending.shift();
    if (offline) request.reject(new Error('Simulated offline check'));
    else request.resolve(new Response(JSON.stringify(releases)));
  }, { releases, offline });
  try {
    await openFromHelp();
    await expect(dialog.getByRole('status')).toHaveText('Checking for updates…');
    await page.screenshot({ path: path.join(folder, 'updates-checking.png') });
    await complete();
    await expect(dialog.getByRole('status')).toContainText('No newer Mac release is published.');
    expect((await status()).checkedAt).toBeTruthy();
    await dialog.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Checking for updates…');
    await complete([], true);
    await expect(dialog.getByRole('status')).toContainText('Could not check for updates.');
    await page.screenshot({ path: path.join(folder, 'updates-offline.png') });
    const parts = currentVersion.split('.').map(Number), version = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    const name = `Forma-Studio-${version}-${process.arch}.dmg`;
    await dialog.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Checking for updates…');
    await complete([{ tag_name: `v${version}`, draft: false, prerelease: false, assets: [{ name, state: 'uploaded', size: 1024, browser_download_url: `https://github.com/postgigg/forma-studio/releases/download/v${version}/${name}` }] }]);
    await expect(dialog.getByRole('button', { name: 'View release', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Download update', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Save & restart', exact: true })).toHaveCount(0);
    expect((await status()).releaseUrl).toBe(`https://github.com/postgigg/forma-studio/releases/tag/v${version}`);
    await dialog.getByRole('button', { name: 'Keep working', exact: true }).click();
    await openFromMenu();
    await expect(dialog.getByRole('status')).toHaveText('Checking for updates…');
    await complete();
    await expect(dialog.getByRole('status')).toContainText('No newer Mac release is published.');
    expect(await app.evaluate(() => globalThis.formaReleaseProof.requests)).toEqual(Array(4).fill('https://api.github.com/repos/postgigg/forma-studio/releases?per_page=100&page=1'));
  } finally {
    await app.evaluate(() => { globalThis.fetch = globalThis.formaReleaseProof.original; delete globalThis.formaReleaseProof; });
  }
  let liveUpdateCheck = null;
  if (live) {
    const previousCheck = (await status()).checkedAt;
    await dialog.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await expect.poll(async () => { const next = await status(); return next.phase !== 'checking' && next.checkedAt !== previousCheck; }, { timeout: 15000 }).toBe(true);
    liveUpdateCheck = await status();
    expect(['idle', 'available']).toContain(liveUpdateCheck.phase);
    expect(liveUpdateCheck.checkedAt).toBeTruthy();
    console.log('Live GitHub release check:', JSON.stringify(liveUpdateCheck));
  }
  await page.screenshot({ path: path.join(folder, 'updates.png') });
  await dialog.getByRole('button', { name: 'Keep working', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return { manualReleaseCheck: true, liveUpdateCheck };
}
