import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import desktopPlatform from '../desktop/platform.cjs';
import { aiEngine } from '../server/ai-engine.mjs';
import { saved } from './qa-fixture.mjs';
import { checkUpdateDialog } from './qa-desktop-updates.mjs';
const folder = path.resolve(process.env.FORMA_SMOKE_OUTPUT || '.local/desktop-smoke'); await mkdir(folder, { recursive: true });
const localPackagedExe = process.platform === 'darwin'
  ? path.resolve('release', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Forma Studio.app/Contents/MacOS/Forma Studio')
  : path.resolve('release/win-unpacked/Forma Studio.exe');
const packagedExe = process.env.FORMA_PACKAGED_EXE || (process.argv.includes('--packaged') ? localPackagedExe : undefined);
const executablePath = packagedExe || createRequire(import.meta.url)(desktopPlatform.electronPackage());
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const app = await electron.launch({ executablePath, args: packagedExe ? [] : ['.'], env: { ...process.env, FORMA_DESKTOP_TEST_DATA: folder }, timeout: 60000 });
async function run() {
try {
  const runtimeVersion = await app.evaluate(() => process.versions.electron);
  expect(runtimeVersion).toBe(desktopPlatform.electronVersion(pkg));
  const page = await app.firstWindow(); await page.getByLabel('Design title', { exact: true }).waitFor({ timeout: 60000 });
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.setBackgroundThrottling(false); });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await expect(page.getByLabel('Design title', { exact: true })).toBeVisible();
  await expect(page.locator('.wordmark .logo-mark')).toHaveAttribute('src', '/brand/forma-mark.svg');
  await expect(page.locator('.wordmark .logo-wordmark')).toHaveAttribute('src', '/brand/forma-wordmark.svg');
  expect(await page.evaluate(() => fetch('/brand/forma-mark.svg').then(response => response.text()))).toBe(await readFile('public/brand/forma-mark.svg', 'utf8'));
  const isolation = await page.evaluate(() => ({ endpoint: window.formaDesktop?.aiEndpoint, platform: window.formaDesktop?.platform, node: typeof window.require }));
  expect(isolation).toEqual({ endpoint: 'http://127.0.0.1:51863', platform: process.platform, node: 'undefined' });
  console.log('Desktop editor loaded with isolated renderer.');
  const updateProof = await checkUpdateDialog({ app, page, folder, currentVersion: pkg.version, live: process.argv.includes('--live-updates') });
  console.log(updateProof.manualReleaseCheck ? 'Mac update dialog passed native entry points, GitHub release results and offline retry.' : 'Unsupported build update dialog passed native entry points.');
  if (process.argv.includes('--updates-only')) {
    expect(errors).toEqual([]);
    await writeFile(path.join(folder, 'updates-result.json'), JSON.stringify({ testedAt: new Date().toISOString(), scope: 'desktop-updates', platform: process.platform, arch: process.arch, runtimeVersion, packaged: !!packagedExe, isolatedRenderer: true, manualUpdateDialog: true, updateStatusFeedback: true, ...updateProof, errors }, null, 2));
    return;
  }
  await page.getByRole('button', { name: 'New blank design', exact: true }).click();
  await page.getByLabel('Design name', { exact: true }).fill('Desktop installation proof');
  await page.getByRole('button', { name: 'Create design', exact: true }).click();
  await page.getByRole('button', { name: '3D objects', exact: true }).click();
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Add Cube', exact: true }).click();
  await page.getByRole('button', { name: 'Add 3D object', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  console.log('3D object created.');
  const modifier = process.platform === 'darwin' ? '⌘' : 'Ctrl';
  await expect(page.getByRole('button', { name: `Undo (${modifier}+Z)`, exact: true })).toBeVisible();
  // Click the real native menu; these commands must edit canvas history instead
  // of Chromium's text history when the canvas is focused.
  await page.locator('.upper-canvas').focus();
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('edit-undo').click());
  await expect.poll(async () => (await saved(page)).pages[0].data.objects.length).toBe(0);
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('edit-redo').click());
  await expect.poll(async () => (await saved(page)).pages[0].data.objects.length).toBe(1);
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('edit-selectAll').click());
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+d' : 'Control+d');
  await expect.poll(async () => (await saved(page)).pages[0].data.objects.length).toBe(2);
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('edit-undo').click());
  await expect.poll(async () => (await saved(page)).pages[0].data.objects.length).toBe(1);
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('edit-selectAll').click());
  await expect(page.getByRole('button', { name: 'Edit 3D object', exact: true })).toBeVisible();
  await page.getByLabel('Design title', { exact: true }).focus();
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('edit-selectAll').click());
  await expect.poll(() => page.getByLabel('Design title', { exact: true }).evaluate(input => input.selectionEnd - input.selectionStart)).toBe('Desktop installation proof'.length);
  await page.locator('.upper-canvas').focus();
  console.log('Platform shortcut labels and native canvas/text menu commands passed.');
  await page.getByRole('button', { name: 'AI Designer', exact: true }).click();
  await expect(page.locator('.ai-connection')).toContainText('connected', { timeout: 30000 });
  await expect(page.getByLabel('AI engine', { exact: true })).toContainText(aiEngine.modelLabel);
  console.log('Bundled AI engine connected.');
  await expect(page.getByRole('button', { name: 'Your account', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Campaigns', exact: true }).click();
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await page.getByLabel('Campaign name', { exact: true }).fill('Desktop campaign proof');
  await page.getByLabel('Campaign objective', { exact: true }).fill('Introduce the new collection to local studio clients.');
  await page.getByLabel('Campaign audience', { exact: true }).fill('Local studio clients');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Folder name', { exact: true }).fill('Launch collection');
  await page.getByLabel('Folder intent', { exact: true }).fill('Invite clients to explore the launch collection.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Save folder', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Launch collection', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  console.log('Packaged campaign wizard and account-free workspace passed.');
  await expect(page.getByText('AI account & connection', { exact: true })).toHaveCount(0);
  // Capture the bundled app's own static page through the desktop bridge.
  const captured = await page.evaluate(async () => {
    const base = window.formaDesktop.aiEndpoint;
    const s = await (await fetch(base + '/session')).json();
    const r = await fetch(base + '/frames/capture', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forma-Token': s.token }, body: JSON.stringify({ url: location.origin, device: 'iphone' }), signal: AbortSignal.timeout(45000) });
    const result = await r.json(); return { status: r.status, device: result.device, width: result.width, png: result.src?.startsWith('data:image/png;base64,'), error: result.error };
  });
  expect(captured.status, captured.error).toBe(200); expect(captured.width).toBe(390); expect(captured.png).toBe(true);
  console.log('Desktop website capture passed.');
  const fixture = JSON.parse(await readFile('tests/designer.fixture.json', 'utf8'));
  const reviewed = await app.evaluate(async ({ app, BrowserWindow, session }, proposal) => {
    const require = process.getBuiltinModule('node:module').createRequire(app.getAppPath() + '/package.json');
    const { renderProposal } = require('./desktop/render.cjs');
    const origin = new URL(BrowserWindow.getAllWindows()[0].webContents.getURL()).origin;
    const result = await renderProposal({ BrowserWindow, session, origin, proposal });
    return { pages: result.images.length, png: result.images.every(image => image.startsWith('data:image/png;base64,')), thumbnails: result.thumbnails.length, editableLayers: result.layouts.every(layers => layers.length > 0) };
  }, fixture);
  expect(reviewed).toEqual({ pages: fixture.pages.length, png: true, thumbnails: fixture.pages.length, editableLayers: true });
  await expect.poll(() => app.windows().length).toBe(1);
  console.log('Bundled browser rendered AI review previews without a separate browser install.');
  for (const format of ['png', 'json', 'pdf']) {
    const output = path.join(folder, 'desktop-export.' + format);
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, output);
    await page.getByRole('button', { name: 'Export', exact: true }).click(); await page.getByLabel('File type', { exact: true }).selectOption(format);
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await readFile(output)).length).toBeGreaterThan(format === 'json' ? 500 : 5000);
  }
  await page.screenshot({ path: path.join(folder, 'desktop.png') });
  await page.getByRole('button', { name: 'Edit 3D object', exact: true }).click();
  await page.getByLabel('3D shape', { exact: true }).selectOption('text');
  await page.getByLabel('3D lettering', { exact: true }).fill('FORMA');
  await expect.poll(() => page.getByLabel('3D object preview', { exact: true }).evaluate(c => {
    const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let count = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 128) count++; return count;
  })).toBeGreaterThan(10000);
  await page.screenshot({ path: path.join(folder, '3d-editor.png') });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('button', { name: 'Add a heading', exact: true }).click();
  await page.getByLabel('Upload font files', { exact: true }).setInputFiles({ name: 'Desktop Brand Font.ttf', mimeType: 'font/ttf', buffer: await readFile('public/fonts/formadeco.ttf') });
  await expect(page.getByRole('status').filter({ hasText: 'Fonts added' })).toBeVisible();
  await page.getByLabel('Quick font', { exact: true }).selectOption({ label: 'Desktop Brand Font' });
  const family = await page.getByLabel('Quick font', { exact: true }).inputValue();
  expect(await page.evaluate(font => document.fonts.check(`16px "${font}"`), family)).toBe(true);
  await page.getByLabel('Text spacing', { exact: true }).click();
  await expect(page.getByLabel('Quick line spacing')).toBeVisible();
  await page.getByLabel('Quick line spacing').fill('1.5');
  await page.getByLabel('Text spacing', { exact: true }).click();
  // Native capture keeps a hidden test window hidden and requests a compositor frame.
  const fontScreenshot = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
  const fontPng = Buffer.from(fontScreenshot, 'base64'); expect(fontPng.length).toBeGreaterThan(10000);
  await writeFile(path.join(folder, 'desktop-fonts.png'), fontPng);
  await page.getByRole('button', { name: 'Brand', exact: true }).click();
  await page.getByRole('button', { name: 'Set up brand and style', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Minimal design style', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Personal design details').fill('Minimal, considered layouts with confident typography.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Mission statement', { exact: true }).fill('Help local creators communicate their ideas with clarity.');
  await page.getByRole('button', { name: 'Save brand & style', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (await page.getByRole('button', { name: 'Show page thumbnails', exact: true }).isVisible()) await page.getByRole('button', { name: 'Show page thumbnails', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate page', exact: true }).click();
  await expect(page.locator('[data-page-id]')).toHaveCount(2);
  const ids = await page.locator('[data-page-id]').evaluateAll(items => items.map(item => item.getAttribute('data-page-id')));
  const a = await page.locator('[data-page-id]').nth(1).boundingBox(), b = await page.locator('[data-page-id]').first().boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down(); await page.mouse.move(b.x + 5, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('[data-page-id]').first()).toHaveAttribute('data-page-id', ids[1]);
  await expect(page.locator('[data-page-id]').first()).toHaveAttribute('aria-current', 'page');
  const reordered = path.join(folder, 'desktop-page-order.json');
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, reordered);
  await page.getByRole('button', { name: 'Export', exact: true }).click(); await page.getByLabel('File type', { exact: true }).selectOption('json'); await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(JSON.parse(await readFile(reordered,'utf8')).pages.map(p => p.id)).toEqual([ids[1],ids[0]]);
  console.log('Packaged personal-style onboarding, page drag ordering and native JSON order passed.');
  let macReopen = false;
  if (process.platform === 'darwin') {
    const title = await page.getByLabel('Design title', { exact: true }).inputValue();
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('close-window').click());
    await expect.poll(() => app.windows().length).toBe(0);
    const opening = app.waitForEvent('window');
    await app.evaluate(({ app }) => app.emit('activate'));
    const reopened = await opening;
    await expect(reopened.getByLabel('Design title', { exact: true })).toHaveValue(title);
    await expect(reopened.locator('[data-page-id]')).toHaveCount(2);
    macReopen = true;
    console.log('Mac close saved the workspace; Dock activation reopened it.');
  }
  expect(errors).toEqual([]);
  await writeFile(path.join(folder, 'result.json'), JSON.stringify({ testedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, runtimeVersion, packaged: !!packagedExe, isolatedRenderer: true, manualUpdateDialog: true, updateStatusFeedback: true, ...updateProof, nativeEditMenu: true, platformShortcuts: true, macReopen, bundledReviewBrowser: true, bundledAI: true, engine: aiEngine.model, websiteCapture: true, pngExport: true, pdfExport: true, jsonExport: true, customFonts: true, textSpacing: true, personalDesignStyle: true, pageDragOrder: true, nativeJsonPageOrder: true, errors }, null, 2));
  console.log('Desktop smoke passed: isolated renderer, bundled AI, website capture, 3D, PNG/PDF/JSON saves.');
} catch (error) {
  const page = (await app.windows())[0];
  if (page) { console.error('Desktop diagnostic:', await page.locator('[role=alert]').allTextContents()); await page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {}); }
  throw error;
} finally { await app.close(); }
}
await run();
