import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('rendered review receives real reduced thumbnails of the editable pages', async ({ page }) => {
  const proposal = JSON.parse(await readFile('tests/designer.fixture.json', 'utf8'));
  await page.goto('/?forma-render=1');
  await page.waitForFunction(() => typeof window.__formaRenderProposal === 'function');
  const rendered = await page.evaluate(async proposal => {
    const result = await window.__formaRenderProposal!(proposal);
    const size = async (src: string) => { const image = new Image(); image.src = src; await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight }; };
    return { pages: result.images.length, thumbnails: await Promise.all(result.thumbnails.map(size)), full: await Promise.all(result.images.map(size)) };
  }, proposal);
  expect(rendered.pages).toBe(proposal.pages.length);
  for (let i = 0; i < rendered.pages; i++) {
    const small = rendered.thumbnails[i], full = rendered.full[i];
    expect(Math.max(small.width, small.height)).toBe(320);
    expect(Math.max(full.width, full.height)).toBeGreaterThan(320);
    expect(Math.abs(small.width / small.height - full.width / full.height)).toBeLessThan(.01);
  }
});

test('text backgrounds keep their own color through undo, redo, save, reload and JSON export', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Text',exact:true}).click();
  await page.getByRole('button',{name:'Add a heading',exact:true}).click();
  await page.getByRole('button',{name:'Add text background',exact:true}).click();
  const color=page.getByLabel('Text background color',{exact:true});
  const reselect=async()=>{await page.getByRole('button',{name:/^Layers/}).click();await page.locator('.layer-select').first().click();await page.getByRole('button',{name:'Properties',exact:true}).click();};
  await expect(color).toHaveValue('#ffffff');
  await color.evaluate(input=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'#174c40');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(color).toHaveValue('#174c40');
  await page.getByRole('button',{name:/^Undo \((?:Ctrl|⌘)\+Z\)$/,exact:true}).click();await reselect();await expect(color).toHaveValue('#ffffff');
  await page.getByRole('button',{name:/^Redo \((?:Ctrl|⌘)\+Shift\+Z\)$/,exact:true}).click();await reselect();await expect(color).toHaveValue('#174c40');
  await page.getByRole('button',{name:'Export',exact:true}).click();await page.getByLabel('File type',{exact:true}).selectOption('json');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download',exact:true}).click();
  const data=JSON.parse(await readFile((await (await download).path())!,'utf8'));
  const text=data.pages[0].data.objects.find((object:any)=>object.backgroundColor==='#174c40');expect(text.type.toLowerCase()).toBe('textbox');expect(text.fill).not.toBe('#174c40');
  await page.reload();await expect(page.getByLabel('Design title',{exact:true})).toHaveValue(data.name);
  await page.getByRole('button',{name:/^Layers/}).click();await page.locator('.layer-select').first().click();
  await page.getByRole('button',{name:'Properties',exact:true}).click();await expect(color).toHaveValue('#174c40');
  await page.getByRole('button',{name:'Remove text background',exact:true}).click();await expect(page.getByRole('button',{name:'Add text background',exact:true})).toBeVisible();
});

test('the page-refine control is icon-only and opens the existing page refinement', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Design title', { exact: true })).toBeVisible();
  await page.locator('input[type=file][accept=".json"]').setInputFiles('docs/examples/campaign-instagram.json');
  const button=page.getByRole('button',{name:'Refine page with AI',exact:true});
  await expect(button).toHaveText('');
  await expect(button).toHaveAttribute('title','Refine page with AI');
  expect((await button.boundingBox())!.width).toBeLessThanOrEqual(34);
  await button.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('new campaigns do not silently inherit Forma colors and the palette can be explicitly selected', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Campaigns',exact:true}).click();
  await page.getByRole('button',{name:'Create a campaign',exact:true}).click();
  const checkbox=page.getByRole('checkbox',{name:'Use my brand palette for this campaign',exact:true});
  await expect(checkbox).not.toBeChecked();
  await checkbox.check(); await expect(checkbox).toBeChecked();
  await checkbox.uncheck(); await expect(checkbox).not.toBeChecked();
});

test('AI results expose the original concept, credited references and honest visual-review status', async ({ page }) => {
  const fixture=JSON.parse(await readFile('tests/designer.fixture.json','utf8'));
  const result={...fixture,creativeDirection:{researchStatus:'live',researchedAt:'2026-10-15T19:00:00Z',sources:[{url:'https://dribbble.com/shots/27416611-Phren-Craft-Celtic-Modular-Identity-System',title:'Phren Craft',creator:'Ivana Mundja',basis:'visual',origin:'reference-library',observation:'Material-related colors create a coherent identity.',transferablePrinciple:'Connect the visual system to the business purpose.',doNotCopy:'The dragon identity.'}],routes:[{name:'Everyday stems',concept:'An original editorial flower concept',brandConnection:'Makes everyday gifting feel personal',composition:'Asymmetric',typography:'Serif and sans',colorLogic:'Brand colors',originalTwist:'Rhythm follows the actual stem lengths'}],selectedRoute:0,selectionReason:'Matches the mission'},qualityReview:{status:'needs-attention',summary:'Check the headline spacing before applying.',strengths:['Clear focal point'],issues:[],revisions:1}};
  await page.route('**/session',route=>route.fulfill({json:{ready:true,token:'test-token'}}));
  await page.route('**/jobs',route=>route.fulfill({json:route.request().method()==='POST'?{id:'proof',status:'completed',result,stage:'Ready',elapsedSeconds:1}:[]}));
  await page.route('**/jobs/proof',route=>route.fulfill({json:{id:'proof',status:'completed',result,stage:'Ready',elapsedSeconds:1}}));
  await page.goto('/');await page.getByRole('button',{name:'AI Designer',exact:true}).click();
  await page.getByLabel('AI design brief',{exact:true}).fill('An original florist launch for everyday gifting.');
  await page.getByRole('button',{name:'Create my design',exact:true}).click();
  await expect(page.locator('.ai-result [role="status"]')).toHaveText('Needs review');
  await expect(page.locator('.ai-design-evidence')).toHaveAttribute('open','');
  await expect(page.getByRole('heading',{name:'Everyday stems',exact:true})).toBeVisible();
  await expect(page.getByText('Review these details',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Phren Craft',exact:true})).toHaveAttribute('href',result.creativeDirection.sources[0].url);
  await expect(page.getByText(/By Ivana Mundja/)).toBeVisible();
});
