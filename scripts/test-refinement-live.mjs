import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { importFixture, saved, logo } from './qa-fixture.mjs';
mkdirSync('.local',{recursive:true});mkdirSync('test-results',{recursive:true});
const endpoint='http://127.0.0.1:5188',origin='http://localhost:5186';
const session=await fetch(endpoint+'/session',{headers:{Origin:origin}}).then(r=>r.json());
const headers={Origin:origin,'X-Forma-Token':session.token,'Content-Type':'application/json'};
async function api(route,body) {const r=await fetch(endpoint+route,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({baseURL:origin,viewport:{width:1512,height:982}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await importFixture(page);
 const before=await saved(page);
 let submitted;
 page.on('request',r=>{if(r.url().endsWith('/refinements')&&r.method()==='POST')submitted=r.postDataJSON();});
 await page.getByRole('button',{name:'Improve with AI',exact:true}).click();
 await page.getByLabel('Selection refinement brief').fill('Make this selection feel like a cohesive premium botanical brand. Keep every word exactly. Align the two groups and refine their typography and spacing. Change lavender panels to warm terracotta. Edit the existing daisy photo: change ONLY the white petals to soft lavender, preserve the golden center, the recognizable flower and its transparent background. Keep all layers and both groups editable.');
 await page.getByRole('button',{name:'Generate refinement',exact:true}).click();
 const start=Date.now();let printed=0;
 while(!(await page.getByRole('button',{name:'Apply changes',exact:true}).count())) {
   const err=page.locator('.refine-body [role=alert]');if(await err.count())throw new Error(await err.innerText());
   if(Date.now()-start>540000)throw new Error('Refinement live test timed out.');
   if(Date.now()-printed>15000){console.log('Refinement:',await page.locator('.refine-body .ai-progress').innerText());printed=Date.now();}
   await page.waitForTimeout(1500);
 }
 assert.equal(submitted.nodes.length,7);assert.equal(submitted.images.length,1);
 assert.ok(!submitted.nodes.some(n=>n.id==='untouched'));
 await page.screenshot({path:'test-results/selection-refinement-preview.png'});
 await page.getByRole('button',{name:'Apply changes',exact:true}).click();
 await page.getByRole('dialog',{name:'Improve with AI'}).waitFor({state:'hidden'});
 await page.waitForTimeout(700);
 const after=await saved(page),old=before.pages[0].data.objects,now=after.pages[0].data.objects;
 assert.equal(now.length,4);assert.equal(now.filter(o=>o.type.toLowerCase()==='group').length,2);
 assert.deepEqual(now.find(o=>o.id==='untouched'),old.find(o=>o.id==='untouched'));
 assert.notEqual(now.find(o=>o.id==='photo').src,old.find(o=>o.id==='photo').src);
 for(const id of ['group-a','group-b'])assert.equal(now.find(o=>o.id===id).objects.length,2);
 await page.locator('.canvas-container').screenshot({path:'test-results/refinement-applied.png'});
 writeFileSync('.local/refinement-input.json',JSON.stringify(submitted));
 writeFileSync('.local/refinement-output.json',JSON.stringify(after));
 await page.getByRole('button',{name:/^Undo \((?:Ctrl|⌘)\+Z\)$/,exact:true}).click();
 await page.waitForTimeout(600);const undo=await saved(page);assert.deepEqual(undo.pages[0].data.objects,old);
 console.log('PASS: real AI photo edit, two editable groups, unselected content unchanged, one-step Undo.');
 const brandJob=await api('/jobs',{prompt:'Create a refined original botanical brand launch poster for PETAL STUDIO. Exact wording: PETAL STUDIO; Small rituals. Beautiful days.; Botanical essentials. Use Forma Deco for the main headline and Arial for details. Warm ivory, deep forest and muted terracotta. Thoughtful negative space and confident professional editorial composition. Include the provided brand logo exactly as supplied.',width:1080,height:1080,pages:1,logo,brand:'PETAL STUDIO',palette:['#f7f2e8','#284637','#bd7558']});
 console.log('Brand logo job:',brandJob.id);
 let brand=brandJob;
 while(brand.status==='running'||brand.status==='queued'){await new Promise(r=>setTimeout(r,2000));brand=await api('/jobs/'+brand.id);}
 assert.equal(brand.status,'completed',brand.error);
 assert.equal(brand.result.extraAssets[0].src,logo.src);
 assert.ok(brand.result.pages[0].elements.some(e=>e.type==='asset'&&e.asset==='brand-logo'));
 await page.evaluate(id=>sessionStorage.setItem('forma:ai-job',id),brand.id);
 await page.getByRole('button',{name:'AI Designer',exact:true}).click();
 await page.getByRole('button',{name:'Open editable design',exact:true}).click({timeout:45000});
 await page.waitForTimeout(700);
 const brandDoc=await saved(page);
 assert.ok(brandDoc.pages[0].data.objects.some(o=>o.type.toLowerCase()==='image'&&o.src===logo.src));
 await page.locator('.canvas-container').screenshot({path:'test-results/brand-logo-ai-design.png'});
 assert.deepEqual(errors,[]);
 writeFileSync('.local/refinement-proof.json',JSON.stringify({groups:2,selectedRoots:3,selectedLayers:7,photoEdited:true,unselectedUnchanged:true,singleUndo:true,brandJob:brand.id,brandLogoExact:true,runtimeErrors:errors},null,2));
 console.log('PASS: real branded AI design uses the exact uploaded logo as an independent image layer.');
} finally {await browser.close();}
