import {test,expect} from '@playwright/test';
import {saved} from '../scripts/qa-fixture.mjs';

async function apply(page:any,occasion:string,name:string){
 await page.goto('/');await page.getByLabel('Template occasion').selectOption(occasion);
 await page.getByLabel('Use template dimensions').check();
 await page.getByRole('button',{name:`Apply ${name} template`,exact:true}).click();
}
test('modern photo masks keep editable sources, filters and position after undo and reload',async({page})=>{
 await apply(page,'Wellness & beauty','Move stronger fitness class');
 const image=(design:any)=>design.pages[0].data.objects.find((o:any)=>o.type==='Image');
 await expect.poll(async()=>image(await saved(page))?.clipPath?.type).toBe('Ellipse');
 const original=image(await saved(page));expect(original.src).toContain('runner-coral-v1.png');
 await page.getByRole('button',{name:/^Layers/}).click();
 await page.locator('.layer-select').filter({hasText:'Editorial runner'}).click();
 await page.getByRole('button',{name:'Properties',exact:true}).click();
 await page.getByRole('button',{name:'Mono',exact:true}).click();
 await expect.poll(async()=>image(await saved(page)).filters[0]?.type).toBe('ColorMatrix');
 await page.getByLabel('X position',{exact:true}).fill(String(original.left+15));
 await expect.poll(async()=>image(await saved(page)).left).toBe(original.left+15);
 await page.getByLabel('X position',{exact:true}).blur();await page.keyboard.press('Control+z');
 await expect.poll(async()=>image(await saved(page)).left).toBe(original.left);
 await page.keyboard.press('Control+Shift+z');
 await expect.poll(async()=>image(await saved(page)).left).toBe(original.left+15);
 const edited=JSON.stringify(image(await saved(page)));await page.reload();
 await expect.poll(async()=>JSON.stringify(image(await saved(page)))).toBe(edited);
 await page.getByRole('button',{name:'Export',exact:true}).click();
 await page.getByLabel('File type',{exact:true}).selectOption('png');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download',exact:true}).click();
 expect((await download).suggestedFilename()).toMatch(/\.png$/);
});
test('modern birthday numerals remain native 3D and settings survive a saved design',async({page})=>{
 test.setTimeout(90000);await apply(page,'Birthday posters','Sweet sixteen · cut-paper numerals');
 const solid=(design:any)=>design.pages[0].data.objects.find((o:any)=>o.solid);
 await expect.poll(async()=>solid(await saved(page))?.solid.text).toBe('16');
 await page.getByRole('button',{name:/^Layers/}).click();await page.locator('.layer-select').filter({hasText:'3D 16'}).click();
 await page.getByRole('button',{name:'Edit 3D object',exact:true}).click();
 await page.getByLabel('3D Turn Y degrees',{exact:true}).fill('45');
 await page.getByRole('button',{name:'Apply 3D changes',exact:true}).click();
 await expect.poll(async()=>solid(await saved(page)).solid.rotateY).toBe(45);
 await page.reload();await expect.poll(async()=>solid(await saved(page)).solid.rotateY).toBe(45);
});
test('a modern pitch template retains a real editable chart and its data',async({page})=>{
 await apply(page,'Business pitches','Petal pitch · a considered customer journey');
 const chart=(design:any)=>design.pages[0].data.objects.find((o:any)=>o.chart);
 await expect.poll(async()=>chart(await saved(page))?.chart.labels.length).toBe(4);
 await page.getByRole('button',{name:/^Layers/}).click();await page.locator('.layer-select').filter({hasText:'Editable campaign data'}).click();
 await page.getByRole('button',{name:'Properties',exact:true}).click();
 await page.getByRole('button',{name:'Edit chart data & style',exact:true}).click();
 await page.getByLabel('Row 1 series 1',{exact:true}).fill('37');
 await page.getByLabel('Chart title',{exact:true}).fill('Our own campaign data');
 await page.getByRole('button',{name:'Save chart changes',exact:true}).click();
 await expect.poll(async()=>chart(await saved(page)).chart.series[0].values[0]).toBe(37);
 await page.reload();await expect.poll(async()=>chart(await saved(page)).chart.title).toBe('Our own campaign data');
 await page.getByRole('button',{name:/^Layers/}).click();await page.locator('.layer-select').filter({hasText:'Editable campaign data'}).click();
 await page.getByRole('button',{name:'Properties',exact:true}).click();
 await page.getByRole('button',{name:'Edit chart data & style',exact:true}).click();
 await expect(page.getByLabel('Row 1 series 1',{exact:true})).toHaveValue('37');
 await page.getByLabel('Row 2 series 1',{exact:true}).fill('52');
 await page.getByRole('button',{name:'Save chart changes',exact:true}).click();
 await expect.poll(async()=>chart(await saved(page)).chart.series[0].values).toEqual([37,52,64,88]);
});
