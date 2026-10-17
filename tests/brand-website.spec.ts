import { test,expect,type Page } from '@playwright/test';
import { fixture } from '../scripts/qa-fixture.mjs';
const id='145e1391-d06f-45af-a022-5e0a19444301';
const values={name:'Petal Studio',business:'Seasonal flowers and thoughtful bouquets.',mission:'Bring neighbors closer through seasonal flowers.',audience:'Local gift buyers',voice:'Warm and considered.'};
const result={url:'https://petal.example/',fields:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value,basis:key==='mission'?'suggested':'stated',sourceUrl:'https://petal.example/about',evidence:'Seasonal flowers and thoughtful bouquets for local gift buyers.'}])),sources:[{url:'https://petal.example/about',title:'About Petal Studio'}],warnings:[]};
async function mockWebsite(page:Page,failed=false){
  await page.route('**/session',route=>route.fulfill({json:{ready:true,token:'test-brand-import'}}));
  await page.route('**/brand-imports',route=>route.fulfill({status:202,json:{id,url:result.url,status:'running',stage:'Reading your public website',result:null}}));
  await page.route('**/brand-imports/'+id,route=>route.fulfill({json:{id,url:result.url,status:failed?'failed':'completed',stage:failed?'The website needs another try':'Review your business details',result:failed?null:result,error:failed?'This address does not resolve to a public website.':null}}));
}
async function onboarding(page:Page){await page.goto('/');await page.getByLabel('Design title',{exact:true}).waitFor();await page.getByRole('button',{name:'Your design style',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();}
test('website details remain reviewable, preserve existing fields and save with the existing personal style',async({page})=>{
  await mockWebsite(page);await onboarding(page);
  await page.getByLabel('Style onboarding Company name',{exact:true}).fill('My existing company');
  await page.getByRole('button',{name:'Use my website',exact:true}).click();await page.getByLabel('Your business website',{exact:true}).fill('petal.example');await page.getByRole('button',{name:'Draft from website',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Review your website draft',exact:true})).toBeVisible();await expect(page.getByText('AI suggestion',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Use website Company name',{exact:true})).not.toBeChecked();await expect(page.getByLabel('Style onboarding Mission statement',{exact:true})).toHaveValue('');
  await page.getByLabel('Website draft Mission statement',{exact:true}).fill('A reviewed purpose, in my own words.');await page.getByRole('button',{name:'Fill 4 fields',exact:true}).click();
  await expect(page.getByLabel('Style onboarding Company name',{exact:true})).toHaveValue('My existing company');await expect(page.getByLabel('Style onboarding Mission statement',{exact:true})).toHaveValue('A reviewed purpose, in my own words.');
  const before=await page.evaluate(()=>new Promise(resolve=>{const req=indexedDB.open('forma-studio');req.onsuccess=()=>{const db=req.result,r=db.transaction('workspace').objectStore('workspace').get('brand-profile');r.onsuccess=()=>{db.close();resolve(r.result);};};}));expect(before).toBeUndefined();
  await page.getByRole('button',{name:'Save my design direction',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Brand',exact:true}).click();await expect(page.getByLabel('Company name',{exact:true})).toHaveValue('My existing company');await expect(page.getByLabel('Mission statement',{exact:true})).toHaveValue('A reviewed purpose, in my own words.');
  await page.getByRole('button',{name:'Edit design preferences',exact:true}).click();await expect(page.getByRole('button',{name:'Minimal design style',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('failed website reads leave manual entry available and the sidebar supports a reviewed draft',async({page})=>{
  await mockWebsite(page,true);await page.goto('/');await page.getByRole('button',{name:'Brand',exact:true}).click();await page.getByRole('button',{name:'Use my website',exact:true}).click();await page.getByLabel('Your business website',{exact:true}).fill('https://not-public.example');await page.getByRole('button',{name:'Draft from website',exact:true}).click();await expect(page.getByRole('alert')).toContainText('public website');await page.getByRole('button',{name:'Enter manually',exact:true}).click();await page.getByLabel('Company name',{exact:true}).fill('Manual business');await page.getByRole('button',{name:'Save brand profile',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Brand',exact:true}).click();await expect(page.getByLabel('Company name',{exact:true})).toHaveValue('Manual business');
});
test('website review fits a phone and campaign welcome uses real design imagery with reduced motion',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await mockWebsite(page);await onboarding(page);await page.getByRole('button',{name:'Use my website',exact:true}).click();await page.getByLabel('Your business website',{exact:true}).fill('petal.example');await page.getByRole('button',{name:'Draft from website',exact:true}).click();await expect(page.getByRole('heading',{name:'Review your website draft',exact:true})).toBeVisible();expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.getByRole('button',{name:'Fill 5 fields',exact:true}).click();await page.getByRole('button',{name:'Save my design direction',exact:true}).click();await page.getByRole('button',{name:'Campaigns',exact:true}).click();await expect(page.locator('.campaign-art-card img')).toHaveCount(3);expect(await page.locator('.campaign-art-card').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');await page.locator('.campaign-art-card img').evaluateAll(images=>Promise.all(images.map(img=>(img as HTMLImageElement).decode())));await page.screenshot({path:'test-results/campaign-illustration-phone.png',animations:'disabled'});
});
test('design import rejects remote pattern resources, prototype keys and nonfinite numbers before loading',async({page})=>{
  await page.goto('/');await page.getByLabel('Design title',{exact:true}).waitFor();
  const attempts=[{...structuredClone(fixture),pages:[{...fixture.pages[0],data:{objects:[{type:'Rect',width:100,height:100,fill:{type:'pattern',source:'https://elsewhere.example/track.png'}}]}}]},JSON.parse(JSON.stringify(fixture).replace('"objects":[','"__proto__":{"polluted":true},"objects":[')),{...structuredClone(fixture),pages:[{...fixture.pages[0],data:{objects:[{type:'Rect',width:100,height:100,scaleX:Infinity}]}}]}];
  for(let i=0;i<attempts.length;i++){
    let text=JSON.stringify(attempts[i]);if(i===2)text=text.replace('"scaleX":null','"scaleX":1e999');
    await page.locator('input[type=file][accept=".json"]').setInputFiles({name:'untrusted.json',mimeType:'application/json',buffer:Buffer.from(text)});await expect(page.locator('.toast')).toContainText(i===0?'embedded':i===1?'unsafe object property':'finite');
  }
  expect(await page.evaluate(()=>Object.prototype.hasOwnProperty.call(Object.prototype,'polluted'))).toBe(false);
});
