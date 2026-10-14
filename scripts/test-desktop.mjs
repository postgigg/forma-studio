import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const folder = path.resolve('.local/desktop-smoke'); await mkdir(folder, { recursive: true });
const executablePath = process.env.FORMA_PACKAGED_EXE;
const app = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: ['.'] }), env: { ...process.env, FORMA_DESKTOP_TEST_DATA: folder }, timeout: 60000 });
try {
  const page = await app.firstWindow(); await page.getByLabel('Design title', { exact: true }).waitFor({ timeout: 60000 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await expect(page.getByLabel('Design title', { exact: true })).toBeVisible();
  const isolation = await page.evaluate(() => ({ endpoint: window.formaDesktop?.aiEndpoint, node: typeof window.require }));
  expect(isolation).toEqual({ endpoint: 'http://127.0.0.1:51861', node: 'undefined' });
  console.log('Desktop editor loaded with isolated renderer.');
  await page.getByRole('button', { name: 'New blank design', exact: true }).click();
  await page.getByLabel('Design name', { exact: true }).fill('Desktop installation proof');
  await page.getByRole('button', { name: 'Create design', exact: true }).click();
  await page.getByRole('button', { name: '3D objects', exact: true }).click();
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Add Cube', exact: true }).click();
  await page.getByRole('button', { name: 'Add 3D object', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  console.log('3D object created.');
  await page.getByRole('button', { name: 'AI Designer', exact: true }).click();
  await expect(page.locator('.ai-connection')).toContainText('connected', { timeout: 30000 });
  await expect(page.getByLabel('AI engine', { exact: true })).toContainText('GPT-6 Astra');
  console.log('Bundled AI engine connected.');
  await page.getByText('AI account & connection', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to Codex', exact: true })).toBeVisible();
  // Capture the bundled app's own static page through the desktop bridge.
  const captured = await page.evaluate(async () => {
    const base = window.formaDesktop.aiEndpoint;
    const s = await (await fetch(base + '/session')).json();
    const r = await fetch(base + '/frames/capture', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forma-Token': s.token }, body: JSON.stringify({ url: location.origin, device: 'iphone' }), signal: AbortSignal.timeout(45000) });
    const result = await r.json(); return { status: r.status, device: result.device, width: result.width, png: result.src?.startsWith('data:image/png;base64,'), error: result.error };
  });
  expect(captured.status, captured.error).toBe(200); expect(captured.width).toBe(390); expect(captured.png).toBe(true);
  console.log('Desktop website capture passed.');
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
  expect(errors).toEqual([]);
  await writeFile(path.join(folder, 'result.json'), JSON.stringify({ packaged: !!executablePath, isolatedRenderer: true, bundledAI: true, engine: 'gpt-6-astra', websiteCapture: true, pngExport: true, errors }, null, 2));
  console.log('Desktop smoke passed: isolated renderer, bundled AI, website capture, 3D, PNG/PDF/JSON saves.');
} catch (error) {
  const page = (await app.windows())[0];
  if (page) { console.error('Desktop diagnostic:', await page.locator('[role=alert]').allTextContents()); await page.screenshot({ path: path.join(folder, 'failure.png') }).catch(() => {}); }
  throw error;
} finally { await app.close(); }
