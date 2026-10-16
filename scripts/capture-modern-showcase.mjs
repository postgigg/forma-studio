import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile,copyFile,readFile,stat} from 'node:fs/promises';
import path from 'node:path';

const site=path.resolve('../forma-studio-site/dist/assets'),out='.local/template-modernization';
await mkdir('docs/media',{recursive:true});await mkdir('docs/examples',{recursive:true});await mkdir(site,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.log('Editor error: '+e.message);});
 await page.goto(process.env.FORMA_TEST_URL||'http://127.0.0.1:5193');await page.getByLabel('Design title',{exact:true}).waitFor();
 const exampleIds=['studio-011','studio-083','studio-133','studio-131','studio-056'];
 const examples=await page.evaluate(async ids=>{
  const {templates,templateObjects}=await import('/src/templates.ts'),{StaticCanvas}=await import('/node_modules/.vite/deps/fabric.js');
  const documents=[];
  for(const id of ids){const t=templates.find(t=>t.id===id),canvas=new StaticCanvas(undefined,{width:t.width,height:t.height,enableRetinaScaling:false});
   try{canvas.backgroundColor=t.background;canvas.add(...await templateObjects(t,t.width,t.height));canvas.renderAll();
    documents.push({id:crypto.randomUUID(),name:t.name,width:t.width,height:t.height,updatedAt:new Date().toISOString(),pages:[{id:crypto.randomUUID(),name:t.name,data:canvas.toObject(),thumbnail:canvas.toDataURL({format:'png',multiplier:Math.min(720/t.width,900/t.height)})}]});
   }finally{await canvas.dispose();}
  }return documents;
 },exampleIds);
 const open=async design=>{
  await page.locator('input[type=file][accept=".json"]').setInputFiles({name:'modern-demo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(design))});
  await expect(page.getByLabel('Design title',{exact:true})).toHaveValue(design.name+' (imported)');await page.waitForTimeout(400);
 };
 const shot=async name=>{await page.screenshot({path:`docs/media/${name}.png`});await copyFile(`docs/media/${name}.png`,path.join(site,name+'.png'));};
 await open(examples[0]);await page.getByRole('button',{name:/^Layers/}).click();await page.locator('.layer-select').filter({hasText:'Editorial flowers'}).click();
 await shot('editor-photo-v1.5');
 await open(examples[1]);await page.getByRole('button',{name:/^Layers/}).click();await page.locator('.layer-select').filter({hasText:'3D 16'}).click();
 await page.getByRole('button',{name:'Edit 3D object',exact:true}).click();await expect(page.getByLabel('3D object preview',{exact:true})).toBeVisible();await page.waitForTimeout(400);await shot('editor-solid-v1.5');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await open(examples[2]);await page.getByRole('button',{name:/^Layers/}).click();await page.locator('.layer-select').filter({hasText:'Editable campaign data'}).click();await page.getByRole('button',{name:'Properties',exact:true}).click();
 await page.getByRole('button',{name:'Edit chart data & style',exact:true}).click();
 try{await expect(page.getByLabel('Chart preview',{exact:true})).toBeVisible();}catch(e){await page.screenshot({path:out+'/chart-capture-debug.png'});await writeFile(out+'/chart-capture-debug.json',JSON.stringify({errors,body:await page.locator('body').innerText(),chart:examples[2].pages[0].data.objects.find(o=>o.chart)},null,2));throw e;}
 await shot('editor-chart-v1.5');await page.getByRole('button',{name:'Cancel',exact:true}).click();
 for(const [index,name]of ['modern-florist','modern-birthday-3d','modern-pitch-chart','modern-pitch-cover','modern-florist-card'].entries()){
  await writeFile(`docs/examples/${name}.json`,JSON.stringify(examples[index],null,2)+'\n');
  await writeFile(`docs/examples/${name}.png`,Buffer.from(examples[index].pages[0].thumbnail.split(',')[1],'base64'));
 }
 const campaign={id:'modern-showcase-campaign',name:'Petal Studio · template collection',objective:'An illustrative collection of modern editable templates for a flower studio.',audience:'Local flower lovers',style:'Editorial photography and confident typography',palette:['#243FC7','#D8CEE9','#FFF9EC'],updatedAt:new Date().toISOString(),folders:[{id:'modern-showcase-folder',name:'A few ways to bloom',intent:'Explore modern template compositions at square, card and presentation dimensions.',message:'',cta:'',avoid:'',counts:{},images:[],generatePhoto:false,photoPrompt:'',batches:[]}]};
 const collection=[examples[0],examples[3],examples[4]].map((design,i)=>({...design,id:'modern-collection-'+i,campaignId:campaign.id,folderId:campaign.folders[0].id}));
 await page.evaluate(async({campaign,collection})=>new Promise((resolve,reject)=>{const request=indexedDB.open('forma-studio');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace');store.put(campaign,`campaign:${campaign.id}`);for(const design of collection)store.put(design,`design:${design.id}`);tx.oncomplete=()=>{db.close();resolve(true);};tx.onerror=()=>reject(tx.error);};}),{campaign,collection});
 await page.reload();await page.getByRole('button',{name:'Campaigns',exact:true}).click();await page.getByRole('button',{name:'Petal Studio · template collection 1 folder',exact:true}).click();await page.locator('.campaign-folder-card').click();await expect(page.locator('.campaign-design-grid article')).toHaveCount(3);await page.locator('.campaign-design-grid').scrollIntoViewIfNeeded();await shot('campaign-modern-v1.5');
 const turns=await page.evaluate(async()=>{
  const {defaultSolid}=await import('/src/solid-object.ts'),{prepareSolid,renderSolid}=await import('/src/solid-renderer.ts');
  const settings={...defaultSolid('text','F'),font:'frame',material:'metal',color:'#243FC7',depth:65,bevel:5,rotateX:12,rotateZ:-7,motion:'none'};
  await prepareSolid(settings);const canvas=document.createElement('canvas');canvas.width=800;canvas.height=640;
  const frames=[];for(let rotateY=-80;rotateY<=80;rotateY+=10){renderSolid({...settings,rotateY},canvas);frames.push(canvas.toDataURL('image/webp',.94));}return frames;
 });
 for(const [i,frame]of turns.entries())await writeFile(path.join(site,`solid-turn-${i}.webp`),Buffer.from(frame.split(',')[1],'base64'));
 const files=['studio-011','studio-055','studio-083','occasion-075','studio-107','studio-131','studio-087','studio-113','occasion-065','studio-016','occasion-012','studio-058'];
 for(const id of files)await copyFile(`public/templates/modern-${id}.webp`,path.join(site,`modern-${id}.webp`));
 await copyFile('public/brand/forma-logo.svg',path.join(site,'logo.svg'));await copyFile('public/brand/forma-logo-light.svg',path.join(site,'logo-light.svg'));
 await copyFile('public/photos/modern/creative-studio-v1.png',path.join(site,'creative-studio.png'));
 const htmlFile=path.resolve('../forma-studio-site/dist/index.html');await writeFile(htmlFile,(await readFile(htmlFile,'utf8')).replaceAll('assets/creative-studio.webp','assets/creative-studio.png'));
 expect(errors).toEqual([]);await writeFile(`${out}/showcase-proof.json`,JSON.stringify({capturedAt:new Date().toISOString(),actualEditor:true,templateExamples:exampleIds,editorViews:3,campaignDesigns:3,native3DAngles:turns.length,sourceLogoPreserved:true,errors},null,2));
 console.log('Captured three actual editor views, an editable campaign collection, five example projects and 17 native 3D angles.');
}finally{await browser.close();}
