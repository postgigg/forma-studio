import { readFileSync } from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../shared/assets.json',import.meta.url),'utf8'));
export const sticker=catalog.find(a=>a.category==='AI stickers');
const bytes=readFileSync(new URL('../public'+sticker.src,import.meta.url));
export const logo={id:'qa-logo',name:'Petal Studio mark',src:'data:image/png;base64,'+bytes.toString('base64'),width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
const common={originX:'left',originY:'top',strokeWidth:0,scaleX:1,scaleY:1,angle:0,opacity:1};
const text=(id,value,left,top,size,width)=>({...common,type:'Textbox',id,name:id,text:value,left,top,fontSize:size,width,fontFamily:'Arial',fontWeight:'normal',fill:'#302639',lineHeight:1.12});
export const fixture={id:'qa-design',name:'Selection refinement proof',width:1080,height:1080,updatedAt:new Date().toISOString(),pages:[{id:'qa-page',name:'Selected groups',thumbnail:'',data:{background:'#f7f2e8',objects:[
  {...common,type:'Group',id:'group-a',name:'Headline group',left:90,top:170,width:400,height:220,objects:[{...common,type:'Rect',id:'panel-a',name:'Panel A',left:-200,top:-110,width:400,height:220,fill:'#e6d9ee'},text('title','Morning\nritual',-170,-85,54,335)]},
  {...common,type:'Group',id:'group-b',name:'Details group',left:570,top:215,width:420,height:220,objects:[{...common,type:'Rect',id:'panel-b',name:'Panel B',left:-210,top:-110,width:420,height:220,fill:'#ddd5ed'},text('details','SMALL MOMENTS\nThoughtfully made.',-180,-60,28,360)]},
  {...common,type:'Image',id:'photo',name:'Daisy photo',left:385,top:510,width:logo.width,height:logo.height,scaleX:370/logo.width,scaleY:370/logo.width,src:logo.src,cropX:0,cropY:0,filters:[]},
  {...common,type:'Rect',id:'untouched',name:'Untouched footer rule',left:90,top:1010,width:900,height:6,fill:'#998a69'}
]}}]};
export async function saved(page) { return page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('forma-studio');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,read=db.transaction('workspace','readonly').objectStore('workspace').getAll();read.onsuccess=()=>{const docs=read.result.filter(d=>d?.pages).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));db.close();resolve(docs[0]);};};})); }
export async function importFixture(page) {
  await page.goto('/'); await page.getByLabel('Design title',{exact:true}).waitFor();
  await page.locator('input[type=file][accept=".json"]').setInputFiles({name:'refinement-proof.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await page.getByLabel('Design title',{exact:true}).evaluate(el=>new Promise(resolve=>{const timer=setInterval(()=>{if(el.value.includes('Selection refinement proof')){clearInterval(timer);resolve(true);}},100);}));
  await page.getByRole('button',{name:/^Layers/}).click();
  for(const [i,name] of ['Headline group','Details group','Daisy photo'].entries()) await page.locator('.layer-select').filter({hasText:name}).click(i?{modifiers:['Control']}:{});
}
