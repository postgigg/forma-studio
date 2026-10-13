import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const stickers=JSON.parse(readFileSync('shared/assets.json','utf8')).filter(a=>/^sticker-\d+$/.test(a.id)&&Number(a.id.slice(8))>=101);
const graphics=JSON.parse(readFileSync('shared/graphics-branded.json','utf8'));mkdirSync('.local/proofs',{recursive:true});
if(stickers.length!==200||graphics.length!==250)throw new Error('Expansion catalog count differs.');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1200,height:1450},deviceScaleFactor:1});await page.goto('http://127.0.0.1:5190');
 const style='<style>body{font:13px Arial;background:#f1edf5;color:#44364b;margin:22px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.tile{background:white;padding:12px;border-radius:12px;min-width:0}.tile img{width:100%;height:200px;object-fit:contain}.tile strong{display:block;margin-top:8px;font-size:12px}.tile small{font-size:11px;color:#92849b}.graphics{grid-template-columns:repeat(5,1fr)}.graphics svg{width:100%;height:140px}</style>';
 const proof=[];
 for(let n=0;n<10;n++){
  await page.setContent(style+`<h1>Forma · Original sticker collection ${n+1}/10</h1><main>${stickers.slice(n*20,n*20+20).map(s=>`<div class="tile"><img src="${s.src}"><strong>${s.name}</strong><small>${s.id} · ${s.theme}</small></div>`).join('')}</main>`);
  const checks=await page.evaluate(async()=>{const result=[];for(const i of document.images){await i.decode();const c=document.createElement('canvas');c.width=128;c.height=128;const ctx=c.getContext('2d');ctx.drawImage(i,0,0,128,128);const p=ctx.getImageData(0,0,128,128).data;let transparent=0,opaque=0;for(let j=3;j<p.length;j+=4){if(p[j]===0)transparent++;if(p[j]>230)opaque++;}result.push({src:i.getAttribute('src'),width:i.naturalWidth,height:i.naturalHeight,corner:p[3],transparent,opaque});}return result;});
  for(const c of checks){if(c.corner!==0||c.transparent<500||c.opaque<200)throw new Error('Alpha/content check failed: '+JSON.stringify(c));proof.push(c);}
  await page.screenshot({path:`.local/proofs/sticker-expansion-${n+1}.png`,fullPage:true});
 }
 for(let n=0;n<5;n++){
  await page.setContent(style+`<h1>Forma · Coordinated brand graphics ${n*50+1}–${n*50+50}</h1><main class="graphics">${graphics.slice(n*50,n*50+50).map(g=>`<div class="tile"><svg viewBox="0 0 200 200">${g.parts.map(p=>`<path d="${p.path}" fill="${p.fill||'none'}" stroke="${p.stroke||'none'}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg><strong>${g.name}</strong></div>`).join('')}</main>`);await page.screenshot({path:`.local/proofs/brand-graphics-${n+1}.png`,fullPage:true});
 }
 await page.setContent(`<style>@font-face{font-family:'Forma Frame';src:url('/fonts/formaframe.ttf')}@font-face{font-family:'Forma Soft';src:url('/fonts/formasoft.ttf')}@font-face{font-family:'Forma Deco';src:url('/fonts/formadeco.ttf')}@font-face{font-family:'Forma Outline';src:url('/fonts/formaoutline.ttf')}body{background:#f3eee6;color:#443952;padding:40px;font:18px Arial}section{margin:30px 0;padding:20px 0;border-top:1px solid #c3b7c9}.sample{font-size:55px}.letters{font-size:35px}</style><h1>Forma · Four original type families</h1>${['Forma Frame','Forma Soft','Forma Deco','Forma Outline'].map(f=>`<section><h2>${f}</h2><div class="sample" style="font-family:'${f}'">Beautiful things begin here.</div><div class="letters" style="font-family:'${f}'">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>0123456789 · Éé Àà Ää Çç ß</div></section>`).join('')}`);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'.local/proofs/original-fonts.png',fullPage:true});
 writeFileSync('.local/expanded-library-proof.json',JSON.stringify({stickers:proof.length,graphics:graphics.length,checks:proof},null,2));console.log('PASS: 200 transparent stickers decoded; 250 graphic previews and four font specimens rendered.');
}finally{await browser.close();}
