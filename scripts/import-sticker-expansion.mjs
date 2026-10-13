import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pngDimensions} from '../server/photos.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const read=name=>JSON.parse(readFileSync(path.join(root,name),'utf8'));
const imports=read('.local/sticker-expansion-imports.json'),prompts=read('shared/sticker-prompts-expansion.json').assets,catalog=read('shared/assets.json');
if(imports.length!==200||prompts.length!==200)throw new Error('Expected 200 individually generated expansion stickers.');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),seen=new Set(),proof=[];
for(const entry of catalog.filter(a=>a.category==='AI stickers'&&!imports.some(i=>i.id===a.id)))seen.add(hash(readFileSync(path.join(root,'public',entry.src))));
for(const item of imports){
  const prompt=prompts.find(p=>p.id===item.id);if(!prompt||!/^sticker-\d{3}$/.test(item.id))throw new Error('Unexpected asset.');
  const bytes=readFileSync(item.source),sha256=hash(bytes),dimensions=pngDimensions(bytes);if(seen.has(sha256))throw new Error('Repeated bitmap '+item.id);seen.add(sha256);
  const destination=path.join(root,'public/elements',item.id+'.png');if(existsSync(destination)&&hash(readFileSync(destination))!==sha256)throw new Error('Refusing to replace '+item.id);
  copyFileSync(item.source,destination);
  if(!catalog.some(a=>a.id===item.id))catalog.push({id:item.id,name:prompt.name,category:'AI stickers',theme:prompt.theme,src:'/elements/'+item.id+'.png',description:prompt.name+'; original coordinated '+prompt.theme+' collection'});
  proof.push({...prompt,...dimensions,sha256,bytes:bytes.length,generator:'Built-in imagegen; one transparent asset per call'});
}
writeFileSync(path.join(root,'shared/assets.json'),JSON.stringify(catalog,null,2)+'\n');writeFileSync(path.join(root,'shared/sticker-provenance-expansion.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({imported:proof.length,totalStickers:catalog.filter(a=>a.category==='AI stickers').length,uniqueHashes:seen.size}));
