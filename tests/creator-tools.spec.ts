import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const sample = {
  id: 'creator-tools', name: 'Creator tools proof', width: 1080, height: 1080, updatedAt: new Date().toISOString(),
  pages: [{ id: 'page-one', name: 'One', thumbnail: '', data: { background: '#ffffff', objects: [
    { type: 'Rect', id: 'locked', name: 'Locked shape', left: 50, top: 50, width: 180, height: 160, fill: '#00a7b5', lockMovementX: true, lockMovementY: true },
    { type: 'Textbox', id: 'headline', name: 'Headline', text: 'Make it yours', left: 220, top: 420, width: 600, fontSize: 84, fontFamily: 'Georgia', fill: '#292432' },
    { type: 'Rect', id: 'accent', name: 'Accent', left: 780, top: 800, width: 160, height: 120, fill: '#754adb' },
  ] } }],
};
async function ready(page: Page) { await page.goto('/'); await expect(page.getByLabel('Design title', { exact: true })).toHaveValue('A little growth'); await expect(page.getByRole('button', { name: 'Refine page with AI', exact: true })).toBeEnabled(); }
async function importDesign(page: Page, data: unknown) { await page.getByRole('button', { name: 'Design', exact: true }).click(); await page.locator('input[type=file][accept=".json"]').setInputFiles({ name: 'proof.forma.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) }); await expect(page.getByLabel('Design title', { exact: true })).toHaveValue((data as any).name + ' (imported)'); }
async function exported(page: Page, format = 'json') {
  await page.getByRole('button', { name: 'Export', exact: true }).click(); await page.getByLabel('File type', { exact: true }).selectOption(format);
  const wait = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download', exact: true }).click(); const item = await wait; return readFile((await item.path())!, 'utf8');
}
test('custom fonts and spacing persist, and travel in design, SVG and text-kit exports', async ({ page, browser }) => {
  await ready(page); await importDesign(page, sample);
  await page.getByRole('button', { name: 'Text', exact: true }).click(); await page.getByRole('button', { name: 'Add a heading', exact: true }).click();
  await page.getByLabel('Upload font files', { exact: true }).setInputFiles({ name: 'My Studio Font.ttf', mimeType: 'font/ttf', buffer: await readFile('public/fonts/formadeco.ttf') });
  await expect(page.getByRole('status').filter({ hasText: 'Fonts added' })).toBeVisible();
  await page.getByLabel('Quick font', { exact: true }).selectOption({ label: 'My Studio Font' });
  const family = await page.getByLabel('Quick font', { exact: true }).inputValue(); expect(family).toMatch(/^FormaUser-/);
  await page.getByLabel('Text spacing', { exact: true }).click();
  await page.getByLabel('Quick line spacing').fill('1.65'); await page.getByLabel('Quick letter spacing').fill('0.08');
  await page.getByLabel('Text spacing', { exact: true }).click();
  await page.getByLabel('Text kit name').fill('My brand heading'); await page.getByRole('button', { name: 'Save selected text style', exact: true }).click();
  const kitWait = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export My brand heading text kit', exact: true }).click(); const kitText = await readFile((await (await kitWait).path())!, 'utf8');
  const kit = JSON.parse(kitText); expect(kit.fonts).toHaveLength(1); expect(kit.styles[0].lineHeight).toBe(1.65); expect(kit.styles[0].charSpacing).toBe(80);
  const data = JSON.parse(await exported(page)); expect(data.fonts).toHaveLength(1); expect(data.fonts[0].family).toBe(family);
  expect(await exported(page, 'svg')).toContain(`font-family:'${family}';src:url('data:font/ttf;base64,`);
  await page.reload(); await expect(page.getByLabel('Design title', { exact: true })).toHaveValue(data.name); expect(await page.evaluate(f => document.fonts.check(`16px "${f}"`), family)).toBe(true);
  const context = await browser.newContext({ baseURL: process.env.FORMA_TEST_URL }); const fresh = await context.newPage();
  try { await ready(fresh); await importDesign(fresh, data); expect(await fresh.evaluate(f => document.fonts.check(`16px "${f}"`), family)).toBe(true); await fresh.getByRole('button', { name: 'Text', exact: true }).click(); await fresh.getByLabel('Import text kit file').setInputFiles({ name: 'brand.forma-text-kit.json', mimeType: 'application/json', buffer: Buffer.from(kitText) }); await expect(fresh.getByRole('button', { name: 'Add My brand heading text kit', exact: true })).toBeVisible(); await fresh.getByRole('button', { name: 'Add My brand heading text kit', exact: true }).click(); await expect(fresh.getByRole('status').filter({ hasText: 'added as editable text' })).toBeVisible(); } finally { await context.close(); }
});
test('invalid font uploads fail visibly without adding a font', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByLabel('Upload font files').setInputFiles({ name: 'Broken.ttf', mimeType: 'font/ttf', buffer: Buffer.from('not a font') });
  await expect(page.getByText('Choose a valid TTF, OTF, WOFF or WOFF2 font file.', { exact: true })).toBeVisible(); await expect(page.locator('.custom-font-row')).toHaveCount(0);
});
test('page styles preview and apply real changes, preserve locked layers, and undo cleanly', async ({ page }) => {
  await ready(page); await importDesign(page, sample); const original = JSON.parse(await exported(page));
  await page.getByRole('button', { name: 'Page style', exact: true }).click(); await page.getByRole('button', { name: 'Page palette Electric', exact: true }).click();
  await page.getByLabel('Page layout spacing').focus(); await page.keyboard.press('End'); await page.getByRole('button', { name: 'Apply page style', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  const result = JSON.parse(await exported(page)); expect(result.pages[0].data.background).toBe('#ff633e');
  expect(result.pages[0].data.objects.find((o: any) => o.id === 'locked')).toEqual(original.pages[0].data.objects.find((o: any) => o.id === 'locked'));
  expect(result.pages[0].data.objects.find((o: any) => o.id === 'headline').top).not.toBe(original.pages[0].data.objects.find((o: any) => o.id === 'headline').top);
  await page.getByRole('button', { name: /^Undo \((?:Ctrl|⌘)\+Z\)$/, exact: true }).click(); const undone = JSON.parse(await exported(page)); expect(undone.pages[0].data).toEqual(original.pages[0].data);
});
test('page refinement captures the page without selecting layers and respects locked content', async ({ page }) => {
  await page.route('**/session', route => route.fulfill({ json: { ready: true, token: 'test' } }));
  await ready(page); await importDesign(page, sample); await page.getByRole('button', { name: 'Refine page with AI', exact: true }).click(); await expect(page.getByText('Unlock the selected layers before refining them.', { exact: true })).toBeVisible();
  const editable = structuredClone(sample); editable.name = 'Editable page'; editable.pages[0].data.objects[0].lockMovementX = false; editable.pages[0].data.objects[0].lockMovementY = false;
  await importDesign(page, editable); await page.getByRole('button', { name: 'Refine page with AI', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Refine page with AI', exact: true })).toBeVisible(); await expect(page.locator('.refine-lede')).toContainText('3 page'); await expect(page.getByText('Current page', { exact: true })).toBeVisible(); await expect(page.locator('.refine-previews img').first()).toHaveAttribute('src', /^data:image\/png;base64,/);
});
test('update prompt keeps work accessible and only downloads or restarts after a click', async ({ page }) => {
  await page.addInitScript(() => {
    let receive: any; const counters = { downloads: 0, installs: 0 };
    const state = { phase: 'available', currentVersion: '1.2.0', availableVersion: '1.3.0', required: true, reason: 'A newer Forma is required.', percent: 0, message: '' };
    (window as any).updateProof = counters;
    (window as any).formaDesktop = { aiEndpoint: 'http://127.0.0.1:5188', onBeforeClose: () => () => {}, updateStatus: async () => state, onUpdateState: (fn: any) => { receive = fn; return () => {}; }, onShowUpdates: () => () => {}, checkForUpdates: async () => state, downloadUpdate: async () => { counters.downloads++; receive({ ...state, phase: 'downloaded', percent: 100 }); }, installUpdate: async () => { counters.installs++; return true; } };
  });
  await page.goto('/'); await expect(page.getByRole('dialog', { name: 'Update required', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep working', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); expect(await page.evaluate(() => (window as any).updateProof)).toEqual({ downloads: 0, installs: 0 });
  await page.getByRole('button', { name: 'Update required', exact: true }).click(); await page.getByRole('button', { name: 'Download update', exact: true }).click(); await expect(page.getByRole('button', { name: 'Save & restart', exact: true })).toBeVisible(); expect(await page.evaluate(() => (window as any).updateProof)).toEqual({ downloads: 1, installs: 0 });
  await page.getByRole('button', { name: 'Save & restart', exact: true }).click(); expect(await page.evaluate(() => (window as any).updateProof.installs)).toBe(1);
});
