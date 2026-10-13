import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('.local/proofs',{recursive:true});
const video=readFileSync('.local/motion-proof.webm');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:650,height:600}});await page.setContent('<body style="background:#ded8e6;display:grid;place-items:center;height:100vh;margin:0"><video controls muted width="420"></video></body>');
 const proof=await page.evaluate(async(src)=>{const v=document.querySelector('video');v.src=src;await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=reject;});const c=document.createElement('canvas');c.width=120;c.height=120;const ctx=c.getContext('2d');const sample=()=>{ctx.drawImage(v,0,0,120,120);return c.toDataURL();};const first=sample();await v.play();await new Promise(r=>setTimeout(r,1100));const second=sample();return{width:v.videoWidth,height:v.videoHeight,playedTo:v.currentTime,differentFrames:first!==second};},'data:video/webm;base64,'+video.toString('base64'));if(!proof.differentFrames||proof.playedTo<.7)throw new Error('Video did not decode/move.');await page.screenshot({path:'.local/proofs/motion-video.png'});writeFileSync('.local/video-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));}finally{await browser.close();}
