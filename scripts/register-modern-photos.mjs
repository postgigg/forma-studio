import {readFileSync,writeFileSync} from 'node:fs';
const file='shared/assets.json',catalog=JSON.parse(readFileSync(file,'utf8'));
const {assets}=JSON.parse(readFileSync('public/photos/modern/asset-manifest-v1.json','utf8'));
for(const asset of assets){
 const id=asset.path.split('/').at(-1).replace(/-v1\.png$/,'');
 if(!catalog.some(item=>item.src===asset.path))catalog.push({id:`modern-${id}`,name:asset.subject,category:'Photos',src:asset.path,description:`AI-generated editorial source image: ${asset.subject}. ${asset.uses.join(', ')}. Text and layout are separate editable layers.`});
}
writeFileSync(file,JSON.stringify(catalog,null,2)+'\n');console.log(`Registered ${assets.length} modern photo sources in the editable Photos library.`);
