import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fixture,saved} from './qa-fixture.mjs';
mkdirSync('.local/proofs',{recursive:true});
const photo=readFileSync('.local/photo-output.png');
const design=structuredClone(fixture);design.name='Magic Eraser live proof';design.pages[0].data.objects=design.pages[0].data.objects.slice(2);
Object.assign(design.pages[0].data.objects[0],{name:'Reading corner',src:'data:image/png;base64,'+photo.toString('base64'),left:60,top:190,width:1536,height:1024,scaleX:960/1536,scaleY:960/1536});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1536,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5186');await page.getByLabel('Design title',{exact:true}).waitFor();
 await page.locator('input[type=file][accept=".json"]').setInputFiles({name:'eraser-proof.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(design))});
 await page.getByRole('button',{name:/^Layers/}).click();await page.locator('.layer-select').filter({hasText:'Reading corner'}).click();
 const before=(await saved(page)).pages[0].data.objects;
 await page.getByRole('button',{name:'Magic Eraser',exact:true}).first().click();
 const brush=page.getByLabel('Mark the area to erase');await page.getByAltText('Original photo for Magic Eraser').evaluate(img=>img.decode());
 await page.getByLabel('Eraser brush size').fill('18');const b=await brush.boundingBox();
 await page.mouse.move(b.x+b.width*.225,b.y+b.height*.54);await page.mouse.down();await page.mouse.move(b.x+b.width*.445,b.y+b.height*.54,{steps:14});await page.mouse.up();
 await page.getByLabel('Magic Eraser instructions').fill('Remove the open book from the wooden side table. Continue the natural walnut tabletop, preserving the table shape, chair, olive tree, lighting and entire room.');
 await page.getByRole('button',{name:'Erase with AI',exact:true}).click();
 console.log('Real Magic Eraser submitted through the editor.');
 await page.getByRole('button',{name:'Apply erased photo',exact:true}).waitFor({timeout:480000});
 await page.screenshot({path:'.local/proofs/magic-eraser-live-preview.png'});
 await page.getByRole('button',{name:'Apply erased photo',exact:true}).click();
 let after;for(let i=0;i<60;i++){after=(await saved(page)).pages[0].data.objects;if(after[0].src!==before[0].src)break;await page.waitForTimeout(200);}
 if(after[0].src===before[0].src)throw new Error('Edited photo was not applied.');
 if(JSON.stringify(after[1])!==JSON.stringify(before[1]))throw new Error('Unselected layer changed.');
 writeFileSync('.local/eraser-output.png',Buffer.from(after[0].src.split(',')[1],'base64'));
 await page.keyboard.press('Control+z');let restored=false;for(let i=0;i<60;i++){if((await saved(page)).pages[0].data.objects[0].src===before[0].src){restored=true;break;}await page.waitForTimeout(200);}
 if(!restored||errors.length)throw new Error('Undo/runtime verification failed: '+errors.join(';'));
 writeFileSync('.local/eraser-proof.json',JSON.stringify({realAI:true,applied:true,unselectedUnchanged:true,singleUndo:true,runtimeErrors:errors},null,2));
 console.log('PASS: Real AI erasing applied, unselected layer preserved, one Undo restored the photo.');
}finally{await browser.close();}
