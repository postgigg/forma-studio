import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const assets=JSON.parse(readFileSync("shared/assets.json","utf8")).filter(a=>/^sticker-\d{3}$/.test(a.id));
if(assets.length!==100)throw new Error("Expected 100 new stickers.");
mkdirSync("test-results",{recursive:true});mkdirSync(".local",{recursive:true});
const browser=await chromium.launch({channel:"msedge",headless:true});
try {
  const page=await browser.newPage({viewport:{width:1100,height:1500},deviceScaleFactor:1});
  await page.goto("http://localhost:5186");
  const proof=[];
  for(let i=0;i<assets.length;i+=20){
    const items=assets.slice(i,i+20);
    await page.setContent(`<style>body{font:14px Arial;background:#f7f4fb;margin:24px;color:#382949}h1{font-size:24px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.tile{background:#fff;border-radius:14px;padding:14px}.tile img{width:100%;height:205px;object-fit:contain}.tile strong{display:block;font-size:14px;margin-top:10px}.tile small{color:#92829c}</style><h1>Forma originals · Collection ${i/20+1} of 5</h1><main>${items.map(a=>`<div class="tile"><img src="${a.src}"><strong>${a.name}</strong><small>${a.id} · ${a.theme}</small></div>`).join("")}</main>`);
    const checks=await page.evaluate(async()=>{
      const results=[];
      for(const img of document.images){await img.decode();const canvas=document.createElement("canvas");canvas.width=128;canvas.height=128;const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,128,128);const pixels=ctx.getImageData(0,0,128,128).data;let transparent=0,opaque=0;for(let p=3;p<pixels.length;p+=4){if(pixels[p]===0)transparent++;if(pixels[p]>230)opaque++;}results.push({src:img.getAttribute("src"),width:img.naturalWidth,height:img.naturalHeight,transparent,opaque,corner:pixels[3]});}
      return results;
    });
    for(const item of checks){if(item.corner!==0 || item.transparent<500 || item.opaque<200)throw new Error(`Transparency/content check failed: ${JSON.stringify(item)}`);proof.push(item);}
    await page.screenshot({path:`test-results/sticker-collection-${i/20+1}.png`,fullPage:true});
  }
  writeFileSync(".local/sticker-library-proof.json",JSON.stringify({count:proof.length,checks:proof},null,2));
  console.log(`PASS: ${proof.length} distinct stickers load with transparent backgrounds and visible artwork. Five contact sheets saved.`);
}finally{await browser.close();}
