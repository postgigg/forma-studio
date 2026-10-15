import { test, expect } from '@playwright/test';

for (const width of [1920, 1280, 390]) {
  test(`toolbar uses one row and selection does not move the canvas at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 982 });
    await page.goto('/');
    await expect(page.getByLabel('Design title', { exact: true })).toHaveValue('A little growth');
    if (!await page.locator('input[type=file][accept=".json"]').count()) await page.getByRole('button', { name: 'Design', exact: true }).click();
    const design = { id: 'toolbar-proof', name: 'Toolbar proof', width: 1080, height: 1080, updatedAt: new Date().toISOString(), pages: [{ id: 'page-one', name: 'One', thumbnail: '', data: { background: '#fff', objects: [{ type: 'Textbox', id: 'headline', name: 'Headline', text: 'Make it yours', originX: 'left', originY: 'top', left: 250, top: 420, width: 600, fontSize: 72, fontFamily: 'Georgia', fill: '#292432' }] } }] };
    await page.locator('input[type=file][accept=".json"]').setInputFiles({ name: 'toolbar.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(design)) });
    await expect(page.getByLabel('Design title', { exact: true })).toHaveValue('Toolbar proof (imported)');
    // Close the library overlay on phones so the canvas can receive the pointer.
    if (width < 1000 && await page.locator('.asset-panel').count()) await page.getByRole('button', { name: 'Design', exact: true }).click();
    const before = await page.locator('.canvas-stage').boundingBox();
    const canvasBefore = await page.locator('.upper-canvas').boundingBox();
    const heightBefore = (await page.locator('.context-toolbar').boundingBox())!.height;
    await page.locator('.upper-canvas').click({ position: { x: 300 * canvasBefore!.width / 1080, y: 450 * canvasBefore!.width / 1080 } });
    await expect(page.getByLabel('Quick font', { exact: true })).toBeVisible();
    await expect(page.locator('.context-toolbar')).toHaveClass(/has-selection/);
    expect((await page.locator('.context-toolbar').boundingBox())!.height).toBe(54);
    expect(heightBefore).toBe(54);
    expect(await page.locator('.canvas-stage').boundingBox()).toEqual(before);
    expect(await page.locator('.upper-canvas').boundingBox()).toEqual(canvasBefore);
    const outside = await page.locator('.context-toolbar').evaluate(toolbar => {
      const bounds = toolbar.getBoundingClientRect();
      return [...toolbar.querySelectorAll('button,select,input,summary')].filter(el => {
        if (el.closest('.text-spacing-popover')) return false;
        const r = el.getBoundingClientRect();
        return r.width && r.height && (r.left < bounds.left - 1 || r.right > bounds.right + 1 || r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1);
      }).map(el => el.getAttribute('aria-label') || el.textContent);
    });
    expect(outside).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
