import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { saved } from '../scripts/qa-fixture.mjs';

for (const status of ['needs-attention', 'unavailable', 'reviewed', 'missing'] as const) {
  test(`AI completion presents ${status} honestly and keeps the result editable`, async ({ page }) => {
    const result = JSON.parse(await readFile('tests/designer.fixture.json', 'utf8'));
    if (status !== 'missing') result.qualityReview = {
      status,
      summary: status === 'unavailable' ? 'The preview could not be reviewed. Check it before publishing.' : 'Actual rendered review summary.',
      strengths: [],
      issues: status === 'needs-attention' ? [
        ...Array.from({length:4}, (_, index) => ({page:1,element:`Detail ${index+1}`,problem:'Review this spacing.',fix:'Adjust its spacing.',priority:'craft'})),
        {page:1,element:'Headline',problem:'Essential copy needs more contrast.',fix:'Increase the headline contrast.',priority:'critical'},
      ] : [],
      revisions: 1,
    };
    const job = {id:'review-proof',status:'completed',result,stage:'Your design is ready',elapsedSeconds:1};
    await page.route('**/session', route => route.fulfill({json:{ready:true,token:'test-token'}}));
    await page.route('**/jobs', route => route.fulfill({json:route.request().method()==='POST' ? job : []}));
    await page.route('**/jobs/review-proof', route => route.fulfill({json:job}));
    await page.goto('/');
    await page.getByRole('button',{name:'AI Designer',exact:true}).click();
    await page.getByLabel('AI design brief',{exact:true}).fill('Create an editorial product campaign using the supplied facts.');
    await page.getByRole('button',{name:'Create my design',exact:true}).click();
    const badge = page.locator('.ai-result [role="status"]');
    await expect(badge).toHaveText(status === 'reviewed' ? 'Reviewed' : status === 'needs-attention' ? 'Needs review' : 'Not reviewed');
    if (status === 'needs-attention') {
      await expect(page.getByText('Review these details',{exact:true})).toBeVisible();
      await expect(page.getByText(/Essential copy needs more contrast/)).toBeVisible();
    } else if (status === 'unavailable') {
      await expect(page.getByText('Visual review unavailable',{exact:true})).toBeVisible();
    } else if (status === 'reviewed') {
      await expect(page.locator('.ai-design-evidence')).not.toHaveAttribute('open','');
    }
    await page.getByRole('button',{name:'Open editable design',exact:true}).click();
    await expect(page.getByLabel('Design title',{exact:true})).toHaveValue(result.title);
    await expect.poll(async () => (await saved(page))?.name).toBe(result.title);
  });
}

test('edits capture one thumbnail and retain immediate saving, undo, redo and reload', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__thumbnailCaptures = 0;
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      (window as any).__thumbnailCaptures++;
      return original.apply(this,args);
    };
  });
  await page.goto('/');
  await expect.poll(async () => (await saved(page))?.name).toBe('A little growth');
  const before = await page.evaluate(() => (window as any).__thumbnailCaptures);
  await page.getByLabel('Design title',{exact:true}).fill('Fast save proof');
  await expect.poll(async () => (await saved(page))?.name).toBe('Fast save proof');
  expect(await page.evaluate(() => (window as any).__thumbnailCaptures)-before).toBe(1);
  await page.getByRole('button',{name:/^Undo \((?:Ctrl|⌘)\+Z\)$/,exact:true}).click();
  await expect(page.getByLabel('Design title',{exact:true})).toHaveValue('A little growth');
  await page.getByRole('button',{name:/^Redo \((?:Ctrl|⌘)\+Shift\+Z\)$/,exact:true}).click();
  await expect.poll(async () => (await saved(page))?.name).toBe('Fast save proof');
  await page.getByRole('button',{name:'Design',exact:true}).focus();
  await page.keyboard.press('Control+s');
  await page.reload();
  await expect(page.getByLabel('Design title',{exact:true})).toHaveValue('Fast save proof');
});

test('a failed immediate save remains visible and preserves the prior saved document', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => (await saved(page))?.name).toBe('A little growth');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (value?.name === 'Storage failure proof') throw new DOMException('Test storage quota exhausted','QuotaExceededError');
      return original.call(this,value,...args);
    };
  });
  await page.getByLabel('Design title',{exact:true}).fill('Storage failure proof');
  await expect(page.getByText('Save failed — export a backup',{exact:true})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'Could not save on this device'})).toBeVisible();
  expect((await saved(page))?.name).toBe('A little growth');
});
