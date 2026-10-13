import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('public/templates',{recursive:true});mkdirSync('.local/proofs',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1300,height:1500}});await page.goto('http://127.0.0.1:5190');await page.getByLabel('Design title',{exact:true}).waitFor();
 const ids=await page.evaluate(async()=>{const{templates}=await import('/src/templates.ts');return templates.filter(t=>t.composition).map(t=>t.id);});
 const proof=[];
 for(const id of ids){const result=await page.evaluate(async(id)=>{
   const{templates,templateObjects}=await import('/src/templates.ts'),{StaticCanvas,Textbox}=await import('/node_modules/.vite/deps/fabric.js');
   const t=templates.find(t=>t.id===id),canvas=new StaticCanvas(undefined,{width:t.width,height:t.height,enableRetinaScaling:false});
   await Promise.all(['Arial','Georgia','Forma Frame','Forma Soft','Forma Deco','Forma Outline'].map(f=>document.fonts.load(`32px "${f}"`)));
   canvas.backgroundColor=t.background;const objects=await templateObjects(t,t.width,t.height);canvas.add(...objects);canvas.renderAll();
   const overflow=objects.filter(o=>o instanceof Textbox&&(o.getBoundingRect().left<0||o.getBoundingRect().top<0||o.getBoundingRect().left+o.getBoundingRect().width>t.width+2||o.getBoundingRect().top+o.getBoundingRect().height>t.height+2)).map(o=>({text:o.text,bounds:o.getBoundingRect()}));
   const thumbnail=canvas.toDataURL({format:'webp',quality:.92,multiplier:Math.min(520/t.width,620/t.height)});await canvas.dispose();return{id,name:t.name,layers:objects.length,overflow,thumbnail};
 },id);writeFileSync(`public/templates/${id}.webp`,Buffer.from(result.thumbnail.split(',')[1],'base64'));delete result.thumbnail;proof.push(result);}
 writeFileSync('.local/template-proof.json',JSON.stringify(proof,null,2));
 const overflow=proof.filter(t=>t.overflow.length);console.log(JSON.stringify({rendered:proof.length,overflow}));
 for(let set=0;set<5;set++){
  const items=proof.slice(set*20,set*20+20);await page.setContent(`<style>body{font:14px Arial;background:#eeeaf2;margin:25px;color:#33273e}main{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}.card{background:white;padding:12px;border-radius:10px}.card img{width:100%;height:255px;object-fit:contain}.card strong{display:block;margin-top:10px;font-size:13px}</style><h1>Forma · Original templates ${set*20+1}–${set*20+20}</h1><main>${items.map(t=>`<div class="card"><img src="/templates/${t.id}.webp"><strong>${t.name}</strong></div>`).join('')}</main>`);await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({path:`.local/proofs/templates-${set+1}.png`,fullPage:true});
 }
}finally{await browser.close();}
