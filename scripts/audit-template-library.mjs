import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('src/templates.ts','utf8').replaceAll('\r\n','\n');
const literal=source.match(/export const templates: Template\[\] = (\[[\s\S]*?\n\]);/);
const base=literal?vm.runInNewContext('('+literal[1]+')'):undefined;
if(base?.length===12)writeFileSync('shared/templates-base.json',JSON.stringify(base,null,2)+'\n');
const read=file=>JSON.parse(readFileSync('shared/'+file,'utf8'));
const templates=[...read('templates-studio.json'),...read('templates-base.json'),...read('templates-occasions.json')];
mkdirSync('.local/template-modernization',{recursive:true});
writeFileSync('.local/template-modernization/original-inventory.json',JSON.stringify(templates,null,2));
for(const group of [...new Set(templates.map(t=>t.occasion||t.category))]){
 const rows=templates.filter(t=>(t.occasion||t.category)===group);
 console.log(JSON.stringify({group,count:rows.length,examples:rows.slice(0,3).map(t=>({id:t.id,name:t.name,size:[t.width||1080,t.height||1080],headline:t.headline,copy:t.composition?.filter(l=>l.type==='Textbox').map(l=>l.text)}))}));
}
