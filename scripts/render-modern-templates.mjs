import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const base=process.env.FORMA_TEST_URL||'http://127.0.0.1:5193';
const out='.local/template-modernization';
await mkdir(`${out}/contact-sheets`,{recursive:true});
await mkdir('public/templates',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1480,height:1100}});
 await page.goto(base);await page.getByLabel('Design title',{exact:true}).waitFor();
 const ids=await page.evaluate(async()=>{const {templates}=await import('/src/templates.ts');return templates.map(t=>t.id);});
 const proof=[],previews=new Map();
 for(const [index,id]of ids.entries()){
  const result=await page.evaluate(async id=>{
   const {templates,templateObjects}=await import('/src/templates.ts');
   const {StaticCanvas,Textbox,FabricImage}=await import('/node_modules/.vite/deps/fabric.js');
   const t=templates.find(t=>t.id===id);
   const canvas=new StaticCanvas(undefined,{width:t.width,height:t.height,enableRetinaScaling:false});
   try{
    canvas.backgroundColor=t.background;
    const objects=await templateObjects(t,t.width,t.height);canvas.add(...objects);canvas.renderAll();
    const text=objects.filter(o=>o.type.toLowerCase()==='textbox'),textLayers=t.composition.filter(o=>o.type==='Textbox');
    const overflow=text.filter(o=>{const b=o.getBoundingRect();return b.left<-.5||b.top<-.5||b.left+b.width>t.width+2||b.top+b.height>t.height+2;}).map(o=>({text:o.text,bounds:o.getBoundingRect()}));
    const crowded=text.flatMap((o,i)=>o.height>(textLayers[i].boxHeight||Infinity)+1?[{text:o.text,font:o.fontSize,height:o.height,box:textLayers[i].boxHeight}]:[]);
    const small=text.filter(o=>o.fontSize/Math.min(t.width,t.height)<.019).map(o=>({text:o.text,font:o.fontSize}));
    return {id,name:t.name,category:t.occasion||t.category,width:t.width,height:t.height,thumbnailPath:t.thumbnail,layers:objects.length,
      images:objects.filter(o=>o.type.toLowerCase()==='image').length,masked:objects.filter(o=>o.type.toLowerCase()==='image'&&o.clipPath).length,
      solids:objects.filter(o=>o.type==='SolidObject').length,charts:objects.filter(o=>o.chart).length,
      overflow,crowded,small,fonts:text.map(o=>({text:o.text,font:o.fontSize})),
      thumbnail:canvas.toDataURL({format:'webp',quality:.94,multiplier:Math.min(720/t.width,900/t.height)})};
   }finally{await canvas.dispose();}
  },id);
  await writeFile(`public${result.thumbnailPath}`,Buffer.from(result.thumbnail.split(',')[1],'base64'));
  previews.set(id,result.thumbnail);delete result.thumbnail;proof.push(result);
  if(index%30===0)console.log(`Rendered ${index+1}/${ids.length}: ${result.name}`);
 }
 await writeFile(`${out}/render-proof.json`,JSON.stringify(proof,null,2));
 await page.goto('about:blank');
 for(let start=0;start<proof.length;start+=20){
  const items=proof.slice(start,start+20),set=Math.floor(start/20)+1;
  await page.setContent(`<style>*{box-sizing:border-box}body{font:14px Arial;background:#e7e5de;margin:24px;color:#17261f}main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.card{background:#fff;padding:12px}.card img{width:100%;height:310px;object-fit:contain}.card strong{display:block;margin:10px 0 4px;font-size:14px}.card small{font-size:12px;color:#636963}h1{font-size:25px}</style><h1>Forma Studio · Modern collection ${start+1}–${Math.min(start+20,proof.length)}</h1><main>${items.map(t=>`<article class="card"><img src="${previews.get(t.id)}"><strong>${t.id} · ${t.name}</strong><small>${t.category} · ${t.layers} editable layers</small></article>`).join('')}</main>`);
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
  await page.screenshot({path:`${out}/contact-sheets/collection-${String(set).padStart(2,'0')}.png`,fullPage:true});
 }
 const report={rendered:proof.length,overflow:proof.filter(t=>t.overflow.length),crowded:proof.filter(t=>t.crowded.length),smallText:proof.filter(t=>t.small.length).map(t=>({id:t.id,small:t.small})),photographic:proof.filter(t=>t.images).length,masked:proof.filter(t=>t.masked).length,charts:proof.filter(t=>t.charts).length};
 await writeFile(`${out}/render-report.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
 if(proof.length!==262||report.overflow.length||report.crowded.length)process.exitCode=1;
}finally{await browser.close();}
