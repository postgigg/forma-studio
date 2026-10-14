import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { saved } from '../scripts/qa-fixture.mjs';

test('3D geometry rotates, saves, reloads, undoes and animates in exports', async ({ page }) => {
  test.setTimeout(180000); await mkdir('.local/proofs', { recursive: true });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.getByRole('button', { name: 'New blank design', exact: true }).click();
  await page.getByLabel('Design name', { exact: true }).fill('3D craft proof'); await page.getByRole('button', { name: 'Create design', exact: true }).click();
  await page.getByRole('button', { name: '3D objects', exact: true }).click();
  await page.getByRole('button', { name: 'Add 3D A', exact: true }).click();
  const preview = page.getByLabel('3D object preview', { exact: true });
  await expect(preview).toBeVisible(); await page.getByLabel('3D lettering', { exact: true }).fill('FORMA');
  await page.getByLabel('3D material', { exact: true }).selectOption('metal');
  await page.getByLabel('3D Turn Y degrees', { exact: true }).fill('-35');
  await page.getByLabel('3D animation', { exact: true }).selectOption('spin');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await preview.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('3D Turn Y degrees', { exact: true })).toHaveValue('-34');
  await expect.poll(() => preview.evaluate((c: HTMLCanvasElement) => {
    const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let filled = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 128) filled++;
    return filled;
  })).toBeGreaterThan(10000);
  await preview.screenshot({ path: '.local/proofs/3d-lettering.png' });
  await page.getByRole('button', { name: 'Add 3D object', exact: true }).click();
  await expect.poll(async () => (await saved(page)).pages[0].data.objects.at(-1)?.solid?.text).toBe('FORMA');
  await page.reload(); await page.getByRole('button', { name: /^Layers/ }).click();
  await page.locator('.layer-select').filter({ hasText: '3D FORMA' }).click();
  await page.getByRole('button', { name: 'Edit 3D object', exact: true }).click();
  await expect(page.getByLabel('3D material', { exact: true })).toHaveValue('metal');
  await expect(page.getByLabel('3D Turn Y degrees', { exact: true })).toHaveValue('-34');
  await page.getByLabel('3D Turn Y degrees', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Apply 3D changes', exact: true }).click();
  await expect.poll(async () => (await saved(page)).pages[0].data.objects.at(-1).solid.rotateY).toBe(45);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await saved(page)).pages[0].data.objects.at(-1).solid.rotateY).toBe(-34);
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(page.locator('.presentation .motion-canvas')).toHaveAttribute('data-ready', 'true');
  const frame = () => page.getByLabel('Animated design preview').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const first = await frame(); await page.waitForTimeout(400); expect(await frame()).not.toBe(first);
  await page.getByRole('button', { name: 'Close presentation', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('File type', { exact: true }).selectOption('gif');
  await page.getByLabel('Animation resolution').selectOption('360');
  await page.getByLabel('Export animation', { exact: true }).selectOption('none');
  await page.getByLabel('Export animation duration').selectOption('1');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download', exact: true }).click();
  await (await download).saveAs('.local/proofs/3d-turn.gif');
  const bytes = await readFile('.local/proofs/3d-turn.gif'); expect(bytes.subarray(0, 6).toString()).toBe('GIF89a'); expect(bytes.length).toBeGreaterThan(5000);
  expect(errors).toEqual([]);
});

test('rotation handle displays live degrees at different zoom levels', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Design title', { exact: true }).waitFor();
  const design = { id: 'rotation-proof', name: 'Rotation proof', width: 1080, height: 1080, updatedAt: new Date().toISOString(), pages: [{ id: 'rotation-page', name: 'Page 1', thumbnail: '', data: { background: '#fff', objects: [{ type: 'Rect', id: 'square', name: 'Square', originX: 'left', originY: 'top', left: 300, top: 300, width: 200, height: 200, scaleX: 1, scaleY: 1, angle: 0, fill: '#754adb', strokeWidth: 0 }] } }] };
  for (const zoom of [0.5, 0.25]) {
    await page.locator('input[type=file][accept=".json"]').setInputFiles({ name: 'rotation.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(design)) });
    await page.getByLabel('Canvas zoom preset', { exact: true }).selectOption(String(zoom));
    const canvas = page.locator('.upper-canvas'); await canvas.click({ position: { x: 400 * zoom, y: 400 * zoom } });
    const box = (await canvas.boundingBox())!;
    const x = box.x + 400 * zoom, y = box.y + 300 * zoom - 40;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y + 30, { steps: 8 });
    await expect(page.getByLabel('Rotation angle', { exact: true })).toContainText('°');
    await page.mouse.up(); await expect(page.getByLabel('Rotation angle', { exact: true })).toHaveCount(0);
    await expect.poll(async () => Math.abs((await saved(page)).pages[0].data.objects[0].angle)).toBeGreaterThan(10);
  }
});
