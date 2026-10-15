import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBrief, designAssets, validateDesignAssets } from '../server/contract.mjs';
import { validatePhotoBrief } from '../server/photos.mjs';
const assets=JSON.parse(readFileSync(new URL('../shared/assets.json',import.meta.url),'utf8'));
const sticker=assets.find(a=>a.category==='AI stickers');
const src='data:image/png;base64,'+readFileSync(new URL('../public'+sticker.src,import.meta.url)).toString('base64');
const base={prompt:'Create distinct thoughtful flower campaign graphics',width:1080,height:1350,pages:2,campaign:true,clientRequestId:'11111111-2222-3333-4444-555555555555'};
test('campaign photos retain exact pixels and stable asset IDs across saved AI proposals',()=>{
 const brief=validateBrief({...base,campaignImages:[{name:'Product one',src},{name:'Product two',src}]}); const images=designAssets(brief);
 assert.deepEqual(images.map(i=>i.id),['campaign-image-1','campaign-image-2']); assert.equal(images[0].src,src); assert.deepEqual(validateDesignAssets(images),images); assert.equal(brief.clientRequestId,base.clientRequestId);
});
test('campaign input rejects external images, excessive attachments and malformed retry IDs',()=>{
 assert.throws(()=>validateBrief({...base,campaignImages:[{name:'External',src:'https://example.com/private.png'}]}));
 assert.throws(()=>validateBrief({...base,campaignImages:Array.from({length:5},()=>({name:'Image',src}))}));
 assert.throws(()=>validateBrief({...base,clientRequestId:'../unexpected'}));
 assert.throws(()=>validateDesignAssets([{id:'campaign-image-9',name:'Unknown',src}]));
});
test('photo batches preserve a valid retry ID and reject arbitrary path-like IDs',()=>{
 const body={prompt:'A thoughtful botanical campaign photo',format:'Landscape',style:'Studio product',clientRequestId:base.clientRequestId};
 assert.equal(validatePhotoBrief(body).clientRequestId,base.clientRequestId); assert.throws(()=>validatePhotoBrief({...body,clientRequestId:'../private'}));
});
