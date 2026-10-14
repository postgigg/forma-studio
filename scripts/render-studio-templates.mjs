import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('public/templates',{recursive:true});
await mkdir('.local/proofs',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1320,height:1600}});
  await page.goto(process.env.FORMA_TEST_URL || 'http://127.0.0.1:5190');
  await page.getByLabel('Design title',{exact:true}).waitFor();
  const ids=await page.evaluate(async()=>{const {templates}=await import('/src/templates.ts');return templates.filter(t=>t.id.startsWith('studio-')).map(t=>t.id);});
  const proof=[], previews=new Map();
  for (const id of ids) {
    const result=await page.evaluate(async id=>{
      const {templates,templateObjects}=await import('/src/templates.ts');
      const {StaticCanvas,Textbox}=await import('/node_modules/.vite/deps/fabric.js');
      const t=templates.find(t=>t.id===id);
      const canvas=new StaticCanvas(undefined,{width:t.width,height:t.height,enableRetinaScaling:false});
      try {
        canvas.backgroundColor=t.background;
        const objects=await templateObjects(t,t.width,t.height);
        canvas.add(...objects);canvas.renderAll();
        const text=objects.filter(o=>o.type.toLowerCase()==='textbox');
        if(!text.length) throw new Error(`No editable text in ${t.name}`);
        const overflow=text.filter(o=>{const b=o.getBoundingRect();return b.left<0||b.top<0||b.left+b.width>t.width+2||b.top+b.height>t.height+2;}).map(o=>({text:o.text,bounds:o.getBoundingRect()}));
        const crowded=text.filter((o,i)=>o.height>t.composition.filter(l=>l.type==='Textbox')[i].boxHeight+1).map(o=>o.text);
        return {id,name:t.name,occasion:t.occasion,layers:objects.length,overflow,crowded,minFont:Math.min(...text.map(o=>o.fontSize)),thumbnail:canvas.toDataURL({format:'webp',quality:.94,multiplier:Math.min(640/t.width,760/t.height)})};
      } finally {await canvas.dispose();}
    },id);
    await writeFile(`public/templates/${id}.webp`,Buffer.from(result.thumbnail.split(',')[1],'base64'));
    previews.set(result.id,result.thumbnail);delete result.thumbnail;proof.push(result);
  }
  await writeFile('.local/studio-template-proof.json',JSON.stringify(proof,null,2));
  await page.goto('about:blank');
  for(let set=0;set<Math.ceil(proof.length/20);set++) {
    const items=proof.slice(set*20,set*20+20);
    await page.setContent(`<style>body{font:14px Arial;background:#eceaf0;margin:24px;color:#302639}main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.card{background:white;padding:12px;border-radius:8px}.card img{width:100%;height:290px;object-fit:contain}.card strong{display:block;margin-top:8px;font-size:13px}.card small{font-size:11px;color:#776780}</style><h1>Forma / New templates ${set*20+1}–${Math.min(proof.length,set*20+20)}</h1><main>${items.map(t=>`<div class="card"><img src="${previews.get(t.id)}"><strong>${t.name}</strong><small>${t.occasion}</small></div>`).join('')}</main>`);
    await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
    await page.screenshot({path:`.local/proofs/studio-templates-${set+1}.png`,fullPage:true});
  }
  console.log(JSON.stringify({rendered:proof.length,overflow:proof.filter(t=>t.overflow.length),crowded:proof.filter(t=>t.crowded.length),smallText:proof.filter(t=>t.minFont<18)}));
  if(proof.length!==150 || proof.some(t=>t.overflow.length||t.crowded.length)) process.exitCode=1;
} finally {await browser.close();}
