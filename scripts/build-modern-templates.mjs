import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=name=>JSON.parse(readFileSync(`shared/${name}.json`,'utf8'));
const originals=[...read('templates-studio'),...read('templates-base'),...read('templates-occasions')];
const palettes=[
 ['#F6F3EA','#17261F','#E3F56A'],['#1939D3','#FFF9EC','#F6A77E'],
 ['#DFF16B','#182B25','#F9F6E9'],['#F77858','#34241F','#F4EFD9'],
 ['#141E35','#F8F5EB','#CCED63'],['#174438','#FFF7E8','#F7B38F'],
 ['#D8CEE9','#251D36','#D8EC78'],['#F4DECE','#422A25','#BE4439'],
 ['#E3E9E5','#23372E','#547D67'],['#F8F5EE','#233FC5','#F4774C'],
];
const photos={
 flowers:['florist-cobalt-v1.png',.67,.49],cafe:['cafe-morning-v1.png',.62,.61],
 runner:['runner-coral-v1.png',.75,.52],interior:['interior-sunlit-v1.png',.7,.53],
 sculpture:['sculpture-chrome-v1.png',.53,.57],birthday:['birthday-coral-v1.png',.67,.45],
 garden:['garden-table-v1.png',.67,.63],studio:['creative-studio-v1.png',.68,.47],
 lake:['../coast.jpg',.5,.5],
};
const hash=text=>parseInt(createHash('sha256').update(text).digest('hex').slice(0,7),16);
const group=t=>t.occasion||t.category;
const subjects=t=>`${t.name} ${t.headline} ${(t.composition||[]).filter(o=>o.type==='Textbox').map(o=>o.text).join(' ')}`.toLowerCase();
function photograph(t){
 const s=`${t.name} ${t.headline}`.toLowerCase();
 const explicit={botanical:'flowers',coast:'lake',coffee:'cafe',pitch:'studio',launch:'sculpture'};
 if(explicit[t.id])return explicit[t.id];
 if(/alpine|lakeside|lake house|lakeside|mountain/.test(s))return 'lake';
 if(/repair caf[eé]/.test(s))return null;
 if(/wedding|bridal|memorial|anniversary|engagement|botanical|garden|plant|flower|florist|bouquet|bloom|petal|grower/.test(s))return /wedding|bridal|memorial|anniversary|engagement|garden/.test(s)?'garden':'flowers';
 if(/coffee|caf[eé]|bakery|bake|pastry|croissant|brunch|breakfast|cinnamon|espresso/.test(s))return 'cafe';
 if(/running|runner|fitness|gym|pilates|training|sport|wellness|yoga|health/.test(s))return /pilates|yoga|wellness/.test(s)?'garden':'runner';
 if(/interior|architecture|architect|property|real estate|realty|realtor|open house|spaces to be|renovation|home staging/.test(s))return 'interior';
 if(/birthday|\bturns\b|turning|make a wish|sweet sixteen|thirty|forty|fifty|seventy/.test(s))return 'birthday';
 if(/jazz|music|concert|dance|remix|creative|graphic|design|studio|software|digital|technology|art workshop|monoprint|photography|gallery/.test(s))return /consult|photograph|creative professional|design agency/.test(s)?'studio':'sculpture';
 if(/business pitch|consulting|consultant|coaching|career|conference|networking|brand strategy/.test(s))return 'studio';
 return null;
}
function illustration(t,x,y,w,h){
 let shapes=(t.composition||[]).filter(o=>['Path','Ellipse','Triangle','Polygon'].includes(o.type));
 if(t.id==='studio-080')shapes=shapes.filter(o=>o.left>650&&o.top>600);
 if(!shapes.length)return false;
 add({type:'Artwork',name:`${t.name.split(' · ')[0]} · editable illustration`,left:x*W,top:y*H,width:w*W,height:h*H,objects:shapes.map(o=>{const item=structuredClone(o);delete item.id;return item;})});return true;
}
let current,layers,W,H,bg,ink,accent,seed;
function add(layer){layers.push({originX:'left',originY:'top',angle:0,strokeWidth:0,opacity:1,...layer});return layers.at(-1);}
function rect(x,y,w,h,fill=accent,extra={}){return add({type:'Rect',name:'Color field',left:x*W,top:y*H,width:w*W,height:h*H,fill,...extra});}
function rule(x,y,w,color=ink){return rect(x,y,w,Math.max(1.5,H*.0015)/H,color,{name:'Editorial rule'});}
function type(text,x,y,w,h,size,font='Arial',color=ink,weight='normal',extra={}){
 return add({type:'Textbox',name:text.replaceAll('\n',' ').slice(0,72),text,left:x*W,top:y*H,width:w*W,boxHeight:h*H,fontSize:size*W,fontFamily:font,fill:color,fontWeight:weight,lineHeight:1.02,charSpacing:font==='Georgia'?-22:-35,...extra});
}
function photo(key,x,y,w,h,extra={}){
 const [file,positionX,positionY]=photos[key];
 return add({type:'Photo',name:`${key==='sculpture'?'Sculptural artwork':'Editorial '+key} · editable crop`,src:key==='lake'?'/photos/coast.jpg':`/photos/modern/${file}`,left:x*W,top:y*H,width:w*W,height:h*H,positionX,positionY,...extra});
}
function mainCopy(t){
 const raw=(t.composition||[]).filter(o=>o.type==='Textbox').map(o=>({...o}));
 if(!raw.length)return {headline:t.headline,body:[t.subtitle].filter(Boolean)};
 let headline=raw.find(o=>o.text===t.headline)||[...raw].sort((a,b)=>b.fontSize-a.fontSize)[0];
 const shortCode=headline.text.replace(/[^A-Za-z0-9]/g,'').length<3&&!/Birthday|Birthdays/.test(group(t))&&!/%|sale|hours|new year/i.test(t.name+' '+headline.text);
 if(shortCode||!headline.text.replace(/[^A-Za-z0-9]/g,'').length||(group(t)==='Business cards'&&headline.text.replace(/[^A-Za-z]/g,'').length<3))headline=[...raw].filter(o=>o.text.replace(/[^A-Za-z]/g,'').length>=3).sort((a,b)=>b.fontSize-a.fontSize)[0];
 return {headline:headline.text,body:raw.filter(o=>o!==headline).map(o=>o.text)};
}
function copyGrid(items,x,y,w,h,{columns=1,color=ink,font='Arial',size=.027,align='left'}={}){
 if(!items.length)return;
 columns=Math.min(columns,items.length);
 const per=Math.ceil(items.length/columns),gap=Math.min(.045,w*.08),cw=(w-gap*(columns-1))/columns;
 for(let column=0;column<columns;column++){
  const values=items.slice(column*per,(column+1)*per);
  const weights=values.map(value=>Math.max(1,Math.ceil(value.replaceAll('\n',' ').length/Math.max(15,cw*W/(size*W*.52))))+((value.match(/\n/g)||[]).length*.45));
  const total=weights.reduce((a,b)=>a+b,0);let cursor=y;
  values.forEach((value,i)=>{const row=h*weights[i]/total;type(value,x+column*(cw+gap),cursor,cw,row*.84,size,font,color,i===0&&values.length>2?'bold':'normal',{textAlign:align,lineHeight:1.16,charSpacing:0});cursor+=row;});
 }
}
function headline(text,x,y,w,h,size=.13,font='Arial',color=ink,extra={}){
 return type(text,x,y,w,h,size,font,color,font==='Georgia'?'normal':'bold',extra);
}
function mark(text,x,y,w,h,color=accent){
 const initial=text.replace(/[^A-Za-z0-9]/g,'').slice(0,1)||'F';
 type(initial,x,y,w,h,Math.min(w*.85,h*H/W*.9),'Forma Frame',color,'normal',{textAlign:'center'});
}
function solid(text,x,y,w,h,color=accent){
 add({type:'Solid',name:`3D ${text} · rotate and restyle`,left:x*W,top:y*H,width:w*W,height:h*H,solid:{shape:'text',text,font:'frame',color,material:seed%2?'metal':'ceramic',depth:48,bevel:4,rotateX:12,rotateY:seed%2?-24:24,rotateZ:-6,motion:'none'}});
}
function chart(x,y,w,h){
 add({type:'Chart',name:'Editable campaign data',left:x*W,top:y*H,width:w*W,height:h*H,chart:{type:seed%2?'bar':'line',title:'A clearer picture',subtitle:'Illustrative data · replace with your own',labels:['Q1','Q2','Q3','Q4'],series:[{name:'Example series',color:accent,values:[24,46,64,88]}],background:bg,ink,showValues:true}});
}
function photoEditorial(content,key,mode){
 const {headline:title,body}=content;
 if(body.length>4||body.join(' ').length>220||body.some(s=>s.includes('\n')&&s.length>30)||['occasion-031','occasion-056'].includes(current.id))mode=seed%2?1:2;
 const serif=seed%3===0?'Georgia':'Arial';
 const m=.058;
 if(mode===0){
  photo(key,.44,0,.56,1,{mask:seed%2?'arch':undefined});
  headline(title,m,.11,.43,.49,.112,serif);
  rule(m,.655,.32,accent);copyGrid(body,m,.70,.32,.24,{size:.025});
 }else if(mode===1){
  headline(title,m,.055,.88,.24,.133,serif);
  photo(key,.40,.34,.55,.60,{radius:seed%2?W*.024:0});
  copyGrid(body,m,.40,.285,.52,{size:.026});rule(m,.34,.285,accent);
 }else if(mode===2){
  photo(key,m,.18,.41,.69,{mask:seed%2?'arch':'ellipse'});
  headline(title,.54,.14,.40,.40,.11,serif);
  copyGrid(body,.54,.61,.39,.32,{size:.026});
 }else if(mode===3){
  photo(key,0,0,1,.47,{positionY:.42});
  headline(title,m,.52,.88,.25,.13,serif);
  rule(m,.825,.88,accent);copyGrid(body,m,.86,.88,.105,{columns:body.length>2?3:2,size:.025});
 }else if(mode===4){
  headline(title,m,.055,.88,.25,.132,serif);
  photo(key,m,.35,.58,.43,{shadow:{color:'#00000026',blur:25,offsetX:0,offsetY:12}});
  photo(key,.69,.45,.255,.33,{positionX:.8,positionY:.65,mask:seed%2?'ellipse':undefined});
  copyGrid(body,m,.845,.88,.12,{columns:body.length>2?3:2,size:.025});
 }else if(mode===5){
  photo(key,0,0,1,1);
  rect(0,0,.52,1,bg,{name:'Message field',opacity:.96});
  headline(title,m,.13,.40,.43,.115,serif);
  rule(m,.65,.31,accent);copyGrid(body,m,.70,.37,.24,{size:.026});
 }else if(mode===6){
  photo(key,.50,.18,.42,.58,{angle:seed%2?-4:4,shadow:{color:'#0000002e',blur:28,offsetY:14,offsetX:3}});
  headline(title,m,.12,.40,.50,.115,serif);
  rule(m,.79,.86,accent);copyGrid(body,m,.835,.88,.12,{columns:body.length>2?3:2,size:.024});
 }else if(mode===7){
  photo(key,.18,.10,.64,.59,{mask:'arch'});
  headline(title,m,.64,.88,.205,.126,serif,ink,{backgroundColor:bg});
  copyGrid(body,m,.88,.88,.085,{columns:body.length>2?3:2,size:.023});
 }else if(mode===8){
  headline(title,m,.07,.88,.24,.135,serif);
  photo(key,0,.36,1,.35,{positionY:.4,monochrome:seed%3===0});
  copyGrid(body,m,.78,.88,.17,{columns:body.length>2?3:2,size:.028});
 }else{
  photo(key,.47,0,.53,.72,{mask:seed%2?'arch':undefined});
  headline(title,m,.13,.40,.48,.12,serif);
  rect(0,.76,1,.24,ink,{name:'Information field'});
  copyGrid(body,m,.81,.88,.15,{columns:body.length>2?3:2,color:bg,size:.027});
 }
}
function typographic(content,mode){
 const {headline:title,body}=content,m=.065;
 if(mode===0){
  rect(0,0,.025,1,accent);headline(title,m,.12,.86,.48,.16,seed%2?'Arial':'Georgia');
  rule(m,.69,.86,accent);copyGrid(body,m,.75,.86,.19,{columns:body.length>3?2:1,size:.033});
 }else if(mode===1){
  rect(.58,0,.42,1,ink);headline(title,m,.10,.46,.66,.142,seed%3===0?'Georgia':'Arial');
  copyGrid(body,.64,.18,.30,.68,{color:bg,size:.028});
 }else if(mode===2){
  rect(0,0,1,.035,accent);headline(title,m,.14,.86,.43,.157,'Forma Deco');
  copyGrid(body,m,.68,.86,.25,{columns:body.length>3?3:2,size:.029});
 }else if(mode===3){
  headline(title,.085,.10,.83,.55,.15,'Georgia',ink,{textAlign:'center'});
  rule(.30,.72,.40,accent);copyGrid(body,.16,.79,.68,.15,{columns:1,align:'center',font:'Arial',size:.029});
 }else if(mode===4){
  rect(.055,.055,.89,.89,ink,{name:'Ink field'});
  headline(title,.105,.13,.79,.46,.145,'Arial',bg);
  rule(.105,.69,.79,accent);copyGrid(body,.105,.755,.79,.15,{columns:body.length>3?2:1,color:bg,size:.029});
 }else if(mode===5){
  headline(title,m,.085,.86,.49,.153,'Arial');
  rect(0,.66,1,.34,ink);copyGrid(body,m,.72,.86,.22,{columns:body.length>3?3:2,color:bg,size:.030});
 }else if(mode===6){
  headline(title,m,.09,.74,.53,.148,'Georgia');
  rect(.86,.08,.065,.47,accent);rule(m,.73,.86,ink);copyGrid(body,m,.79,.86,.15,{columns:body.length>2?3:2,size:.027});
 }else{
  rect(0,0,1,.18,ink);copyGrid(body.slice(0,1),m,.055,.86,.075,{color:bg,size:.035});
  headline(title,m,.29,.86,.42,.155,'Forma Frame');
  copyGrid(body.slice(1),m,.80,.86,.15,{columns:body.length>3?3:2,size:.030});
 }
}
function card(content,key,mode){
 const {headline:title,body}=content;
 if(mode===0){
  rect(.67,0,.33,1,ink);mark(title,.70,.20,.25,.60,bg);
  headline(title,.065,.12,.55,.28,.073,'Arial');rule(.065,.48,.48,accent);
  copyGrid(body,.065,.58,.53,.31,{columns:body.length>4?2:1,size:.025});
 }else if(mode===1&&key){
  photo(key,.61,0,.39,1,{monochrome:seed%3===0});
  headline(title,.06,.10,.49,.31,.078,seed%2?'Georgia':'Arial');
  copyGrid(body,.06,.56,.48,.34,{columns:body.length>4?2:1,size:.025});
 }else if(mode===2){
  mark(title,.055,.12,.20,.27,ink);headline(title,.30,.16,.63,.24,.067,'Arial');
  rule(.065,.52,.87,accent);copyGrid(body,.065,.64,.87,.26,{columns:2,size:.027});
 }else if(mode===3){
  rect(0,.54,1,.46,ink);headline(title,.06,.085,.86,.34,.096,'Georgia');
  copyGrid(body,.06,.60,.88,.33,{columns:2,color:bg,size:.025});
 }else if(mode===4){
  headline(title,.06,.12,.87,.29,.089,'Arial');
  rect(.06,.53,.035,.33,accent);copyGrid(body,.14,.54,.79,.34,{columns:2,size:.025});
 }else{
  rect(.05,.075,.90,.85,ink);headline(title,.10,.17,.79,.26,.085,'Forma Frame',bg);
  copyGrid(body,.10,.51,.79,.34,{columns:2,color:bg,size:.025});
 }
}
function sign(content,mode){
 const {headline:title,body}=content;
 const right=mode%3===1;
 if(right){
  rect(.68,0,.32,1,ink);headline(title,.055,.10,.57,.76,.18,'Arial');
  copyGrid(body,.735,.15,.21,.72,{color:bg,size:.045});
 }else if(mode%3===2){
  headline(title,.055,.08,.89,.56,.19,mode%2?'Arial':'Forma Frame');
  rect(0,.72,1,.28,ink);copyGrid(body,.06,.77,.88,.18,{columns:body.length>2?2:1,color:bg,size:.046});
 }else{
  rect(.055,.055,.89,.89,ink);headline(title,.10,.11,.80,.51,.17,'Arial',bg);
  rule(.10,.69,.80,accent);copyGrid(body,.10,.76,.80,.14,{columns:body.length>2?2:1,color:bg,size:.045});
 }
}
function party(content,key,mode){
 if(current.id==='studio-079'){
  for(let row=0;row<2;row++)for(let col=0;col<12;col++)if((row+col)%2===0)rect(col/12,.035+row*.044,1/12,.044,ink);
  headline(content.headline,.06,.20,.88,.28,.137,'Arial');
  rect(.06,.55,.88,.12,ink);type(content.body[0],.085,.568,.83,.085,.068,'Arial',bg,'bold');
  copyGrid(content.body.slice(1),.06,.77,.88,.18,{columns:2,size:.031});return;
 }
 const numbers=content.headline.match(/\b(?:[1-9][0-9]?|100)\b/);
 if(numbers&&content.headline.trim()===numbers[0]){
  solid(content.headline,.12,.08,.76,.58,accent);
  rule(.08,.70,.84,ink);
  copyGrid(content.body,.08,.76,.84,.19,{columns:content.body.length>3?2:1,size:.035,align:mode%2?'left':'center'});
 }else if((current.composition||[]).some(o=>o.type==='Path')){
  if(mode%3===0){headline(content.headline,.06,.06,.88,.30,.14,'Arial');illustration(current,.13,.40,.74,.31);copyGrid(content.body,.06,.78,.88,.18,{columns:content.body.length>3?2:1,size:.034});}
  else if(mode%3===1){headline(content.headline,.06,.08,.88,.33,.14,'Georgia');illustration(current,.54,.47,.39,.40);copyGrid(content.body,.06,.53,.41,.39,{size:.034});}
  else{illustration(current,.11,.07,.78,.33);headline(content.headline,.06,.46,.88,.27,.15,'Arial');copyGrid(content.body,.06,.81,.88,.14,{columns:content.body.length>3?2:1,size:.031});}
 }else photoEditorial(content,key==='garden'||key==='cafe'?key:'birthday',mode%10);
}
function pitch(content,key,index){
 const part=index%4;
 if(part===0){photoEditorial(content,key||'sculpture',seed%2?0:5);return;}
 if(part===2){
  headline(content.headline,.05,.075,.89,.18,.085,'Arial');
  chart(.43,.34,.52,.56);copyGrid(content.body,.055,.37,.30,.52,{size:.025});return;
 }
 if(part===1){
  headline(content.headline,.05,.08,.89,.22,.095,'Arial');
  rule(.055,.38,.89,accent);copyGrid(content.body,.055,.47,.89,.43,{columns:3,size:.027});return;
 }
 headline(content.headline,.055,.075,.89,.255,.105,'Georgia');
 rule(.055,.39,.89,accent);
 copyGrid(content.body,.055,.46,.89,.47,{columns:content.body.length>6?3:2,size:.027});
}
function information(t){
 const content=mainCopy(t),texts=t.composition.filter(o=>o.type==='Textbox').map(o=>o.text);
 if(t.id==='studio-121'){
  headline(texts[0],.065,.055,.87,.25,.115,'Arial');type(texts[1],.065,.34,.87,.06,.033,'Georgia');
  for(let i=0;i<3;i++){const y=.47+i*.10;rule(.065,y-.015,.87);type(texts[2+i*2],.065,y,.20,.06,.038,'Arial',ink,'bold');type(texts[3+i*2],.32,y,.615,.07,.032,'Arial',ink,'normal',{charSpacing:0});}
  copyGrid(texts.slice(-2),.065,.85,.87,.11,{size:.025});return;
 }
 if(t.id==='occasion-044'){
  headline(content.headline,.055,.07,.89,.27,.105,'Georgia');
  const rest=content.body;type(rest[0],.055,.39,.89,.05,.028,'Arial',ink,'bold',{charSpacing:60});
  rest.slice(1,-1).forEach((s,i)=>{const x=.055+(i%4)*.225,y=.51+Math.floor(i/4)*.135;add({type:'Ellipse',name:'Editable loyalty stamp',left:x*W,top:y*H,rx:.042*W,ry:.042*W,fill:bg,stroke:ink,strokeWidth:2});type(s,x,y+.022,.084,.07,.031,'Arial',ink,'bold',{textAlign:'center',charSpacing:0});});
  type(rest.at(-1),.055,.86,.89,.08,.026,'Arial',ink,'normal',{charSpacing:0});return;
 }
 if(t.id==='studio-020'||t.id==='occasion-039'){
  headline(content.headline,.055,.06,.89,.21,.092,'Arial');
  const body=content.body,meta=t.id==='studio-020'?body.shift():null,last=body.pop();if(meta)type(meta,.055,.31,.89,.06,.026,'Arial',ink,'bold',{charSpacing:30});
  const per=Math.ceil(body.length/3);
  for(let i=0;i<3;i++){const x=.055+i*.30;rect(x,.43,.285,.43,ink);copyGrid(body.slice(i*per,(i+1)*per),x+.02,.46,.245,.37,{size:.028,color:bg});}
  type(last,.055,.91,.89,.05,.023,'Arial',ink,'normal',{charSpacing:0});return;
 }
 if(t.id==='studio-017'){
  headline(content.headline,.065,.06,.87,.18,.097,'Arial');type(content.body[0],.065,.28,.87,.05,.026,'Arial',ink,'bold',{charSpacing:25});
  for(let i=0;i<3;i++){const y=.40+i*.155;rule(.065,y-.012,.87);type(content.body[1+i*2],.065,y,.27,.06,.027,'Arial',ink,'bold');type(content.body[2+i*2],.38,y,.555,.125,.028,'Arial',ink,'normal',{charSpacing:0,lineHeight:1.2});}
  type(content.body.at(-1),.065,.925,.87,.045,.022,'Arial',ink,'normal',{charSpacing:0});return;
 }
 headline(content.headline,.06,.065,.88,.25,.115,'Arial');
 rule(.06,.39,.88,accent);copyGrid(content.body,.06,.46,.88,.46,{columns:content.body.length>8?3:2,size:.029});
}
function structured(t){
 const texts=t.composition.filter(o=>o.type==='Textbox').map(o=>o.text),content=mainCopy(t);
 const title=content.headline,m=.065;
 const footer=(text,y=.925)=>type(text,m,y,.87,.05,.022,'Arial',ink,'normal',{charSpacing:0,lineHeight:1.15});
 if(t.id==='occasion-012'){
  headline(texts[0],m,.055,.56,.26,.13,'Georgia');
  photo('garden',.72,.055,.21,.25,{mask:'arch'});
  type(texts[1],m,.36,.87,.06,.034,'Arial',ink,'bold',{charSpacing:90});
  const x=m,y=.46,cw=.87/7,ch=.072;
  texts.slice(2,9).forEach((s,i)=>type(s,x+i*cw,y,cw,.05,.028,'Arial',ink,'bold',{textAlign:'center'}));
  const monthStart=(new Date(Date.UTC(2027,8,1)).getUTCDay()+6)%7;
  for(let day=1;day<=30;day++){const cell=monthStart+day-1,col=cell%7,row=Math.floor(cell/7);rule(x+col*cw,y+.055+row*ch,cw*.86,ink);type(String(day),x+col*cw,y+.063+row*ch,cw*.86,.05,.029,'Arial',ink,'normal',{textAlign:'center',charSpacing:0});}
  footer(texts.at(-1));return;
 }
 if(t.id==='occasion-082'){
  headline(texts[0],m,.055,.87,.20,.13,'Arial');type(texts[1],m,.26,.87,.055,.028,'Arial',ink,'normal',{charSpacing:80});
  for(let col=0;col<5;col++){
   const x=m+col*.176,day=texts.slice(2+col*5,7+col*5);
   rect(x,.39,.163,.076,ink);type(day[0],x+.014,.405,.135,.045,.033,'Arial',bg,'bold');
   day.slice(1).forEach((s,row)=>{rect(x,.48+row*.095,.163,.085,row%2?accent:bg,{stroke:ink,strokeWidth:1});type(s,x+.013,.50+row*.095,.137,.05,.023,'Arial',ink,'bold',{charSpacing:0});});
  }footer(texts.at(-1));return;
 }
 if(t.id==='studio-021'){
  headline(texts[0],m,.055,.87,.23,.125,'Arial');type(texts[1],m,.32,.87,.05,.03,'Arial',ink,'bold',{charSpacing:70});
  texts.slice(2,-1).forEach((s,i)=>{const x=m+(i%3)*.296,y=.425+Math.floor(i/3)*.11;rect(x,y,.276,.093,bg,{stroke:ink,strokeWidth:1.5,rx:8,ry:8});type(s,x+.016,y+.012,.10,.06,.044,'Georgia');rule(x+.14,y+.07,.11,ink);});
  footer(texts.at(-1));return;
 }
 if(/certificate/i.test(t.name)){
  rect(.035,.045,.93,.91,bg,{stroke:ink,strokeWidth:2});rect(.05,.065,.013,.87,accent);
  const recipient=texts.find(s=>s==='Jordan Taylor');
  const intro=texts.filter(s=>s!==recipient&&!/dedication|PRESENTER|DIRECTOR|DATE/i.test(s));
  copyGrid(intro,.10,.13,.80,.23,{align:'center',size:.033});
  headline(recipient,.12,.445,.76,.19,.097,'Georgia',ink,{textAlign:'center'});
  type(texts.find(s=>/dedication/i.test(s)),.16,.66,.68,.08,.027,'Arial',ink,'normal',{textAlign:'center',charSpacing:0});
  texts.filter(s=>/^(PRESENTER|DIRECTOR|DATE)$/.test(s)).forEach((s,i)=>{rule(.19+i*.35,.84,.27);type(s,.19+i*.35,.865,.27,.05,.023,'Arial',ink,'normal',{charSpacing:80});});return;
 }
 if(/itinerary/i.test(t.name)){
  headline(texts[0],m,.055,.87,.235,.125,'Georgia');
  // The original source is an alpine lake, not a beach or ocean.
  add({type:'Photo',name:'Alpine lake · editable crop',src:'/photos/coast.jpg',left:m*W,top:.36*H,width:.29*W,height:.50*H,positionX:.5,positionY:.5,mask:'arch'});
  const body=texts.slice(1,-1);let cursor=.37;
  if(body.length%2){type(body.shift(),.43,.29,.50,.055,.025,'Arial',ink,'bold',{charSpacing:60});}
  for(let i=0;i<body.length;i+=2){rule(.43,cursor,.50,accent);type(body[i],.43,cursor+.015,.50,.05,.030,'Arial',ink,'bold');type(body[i+1],.43,cursor+.07,.50,.09,.025,'Arial',ink,'normal',{lineHeight:1.16,charSpacing:0});cursor+=.175;}
  footer(texts.at(-1));return;
 }
 if(/résumé|resume/i.test(t.name)){
  rect(0,0,.027,1,accent);headline(title,m,.06,.87,.22,.115,'Arial');
  const body=texts.filter(s=>s!==title),side=t.id==='occasion-072'?body.splice(0,2):[body.pop()];
  rect(m,.38,.26,.52,ink);copyGrid(side,m+.02,.405,.22,.45,{color:bg,size:.025});
  copyGrid(body,.39,.36,.54,.54,{size:.028});return;
 }
 if(/estimate|invoice/i.test(t.name)){
  headline(title,m,.06,.87,.18,.105,'Arial');
  const rest=texts.filter(s=>s!==title);
  if(t.id==='studio-016'){
   type(rest[0],m,.26,.87,.05,.029,'Arial',ink,'bold',{charSpacing:50});
   copyGrid(rest.slice(1,3),m,.355,.87,.11,{columns:2,size:.026});
   for(let i=0;i<3;i++){const y=.52+i*.072;rule(m,y-.01,.87);type(rest[3+i*2],m,y,.62,.055,.031);type(rest[4+i*2],.74,y,.19,.055,.031,'Arial',ink,'normal',{textAlign:'right'});}
   rect(m,.765,.87,.085,ink);type(rest[9],m+.02,.79,.55,.05,.027,'Arial',bg,'bold');type(rest[10],.66,.78,.25,.055,.042,'Arial',bg,'bold',{textAlign:'right'});footer(rest[11],.895);
  }else{
   copyGrid(rest.slice(0,3),m,.28,.87,.17,{columns:2,size:.026});
   rest.slice(3,7).forEach((s,i)=>{rule(m,.51+i*.066,.87);type(s,m,.525+i*.066,.87,.05,i===0?.022:.028,'Arial',ink,i===0?'bold':'normal',{charSpacing:0});});
   rect(m,.81,.87,.065,ink);type(rest[7],m+.02,.825,.83,.04,.031,'Arial',bg,'bold',{textAlign:'right'});footer(rest[8]);
  }return;
 }
 if(t.id==='occasion-090'){
  headline(texts[0],m,.055,.87,.15,.13,'Arial');type(texts[1],m,.235,.87,.05,.028,'Arial',ink,'normal',{charSpacing:50});
  for(let i=0;i<4;i++){const y=.36+i*.13;rule(m,y,.87);headline(texts[2+i*3],m,y+.02,.16,.08,.065,'Georgia');type(texts[3+i*3],.28,y+.018,.65,.045,.031,'Arial',ink,'bold');type(texts[4+i*3],.28,y+.068,.65,.045,.025,'Arial',ink,'normal',{charSpacing:0});}footer(texts.at(-1));return;
 }
 if(/checklist/i.test(t.name)){
  headline(title,m,.065,.87,.25,.115,'Arial');
  const rest=texts.filter(s=>s!==title),first=rest.shift(),last=rest.pop();type(first,m,.34,.87,.07,.034,'Georgia');
  const rowHeight=Math.min(.075,.43/rest.length);
  rest.forEach((s,i)=>{const y=.46+i*rowHeight;rect(m,y+.008,.022,.022*W/H,bg,{stroke:ink,strokeWidth:1.5});type(s,m+.05,y,.82,rowHeight*.85,.028,'Arial',ink,'normal',{charSpacing:0});rule(m+.05,y+rowHeight*.90,.82,accent);});footer(last);return;
 }
 // Menus and service lists keep section/description pairs; a course is not a footer.
 headline(title,m,.065,.87,.23,.12,seed%2?'Georgia':'Arial');
 const rest=texts.filter(s=>s!==title);
 const closing=['studio-002','studio-005'].includes(t.id)?null:rest.pop();
 if(rest.length%2){type(rest.shift(),m,.32,.87,.05,.028,'Arial',ink,'normal',{charSpacing:55});}
 const n=Math.ceil(rest.length/2),rowH=.49/Math.max(n,1);
 for(let i=0;i<rest.length;i+=2){const y=.415+Math.floor(i/2)*rowH;rule(m,y-.012,.87,ink);type(rest[i],m,y,.29,rowH*.80,.030,'Arial',ink,'bold',{charSpacing:0});if(rest[i+1])type(rest[i+1],.40,y,.53,rowH*.85,.029,'Arial',ink,'normal',{charSpacing:0,lineHeight:1.2});}
 if(closing)footer(closing);
}
const output=[];
let pitchIndex=0;
for(const [index,t] of originals.entries()){
 current=t;W=t.width||1080;H=t.height||1080;seed=hash(t.id+' / '+t.name);layers=[];
 const category=group(t),content=mainCopy(t),key=photograph(t);
 const deck=category==='Business pitches'?Math.floor(pitchIndex/4):null;
 [bg,ink,accent]=palettes[(deck??seed)%palettes.length];
 let family;
 if(category==='Yard signs'){family='distance typography';sign(content,seed%9);}
 else if(category==='Business cards'){family='identity and contact';card(content,key,seed%6);}
 else if(category==='Business pitches'){family='presentation system';pitch(content,key,pitchIndex++);}
 else if(t.id==='occasion-034'){family='identity and contact';card(content,key,2);}
 else if((category==='Menus'||/schedule|planner|calendar|reading challenge|estimate|invoice|résumé|resume|service edit|service menu|menu|itinerary|checklist|certificate|pricing|price list|tracker/i.test(t.name))&&t.composition){family='structured document';structured(t);}
 else if(['studio-017','studio-020','studio-110','occasion-039','occasion-044'].includes(t.id)||content.body.length>6){family='information architecture';information(t);}
 else if(/Birthday|Birthdays/.test(category)){family='celebration artwork';party(content,key,seed%17);}
 else if(key){family='photographic editorial';photoEditorial(content,key,seed%10);}
 else{family='typographic editorial';typographic(content,seed%8);}
 const composition=layers.map((layer,i)=>({...layer,id:`${t.id}-modern-${i+1}`}));
 output.push({...t,width:W,height:H,background:bg,ink,accent,layout:'custom',font:composition.find(o=>o.type==='Textbox')?.fontFamily||'Arial',headline:content.headline,
  thumbnail:`/templates/modern-${t.id}.webp`,composition,designEdition:'Modern 2026',artDirection:{family,photo:key,recipe:seed%10,sourceTemplate:t.id}});
}
if(output.length!==262||new Set(output.map(t=>t.id)).size!==262)throw new Error('The original 262 template identities must be retained.');
for(const t of output){
 const source=originals.find(o=>o.id===t.id),expected=mainCopy(source),actual=t.composition.filter(o=>o.type==='Textbox'||o.type==='Solid').map(o=>o.text||o.solid.text);
 for(const text of [expected.headline,...expected.body])if(!actual.includes(text))throw new Error(`Missing original wording in ${t.id}: ${text}`);
 for(const layer of t.composition)for(const key of ['left','top'])if(!Number.isFinite(layer[key]))throw new Error(`Invalid ${key} in ${t.id}`);
}
writeFileSync('shared/templates-modern.json',JSON.stringify(output,null,2)+'\n');
mkdirSync('.local/template-modernization',{recursive:true});
const report={templates:output.length,preservedIds:262,preservedWording:true,photographic:output.filter(t=>t.composition.some(o=>o.type==='Photo')).length,maskedPhotos:output.filter(t=>t.composition.some(o=>o.type==='Photo'&&(o.mask||o.radius))).length,editable3D:output.filter(t=>t.composition.some(o=>o.type==='Solid')).length,editableCharts:output.filter(t=>t.composition.some(o=>o.type==='Chart')).length,families:Object.fromEntries([...new Set(output.map(t=>t.artDirection.family))].map(f=>[f,output.filter(t=>t.artDirection.family===f).length]))};
writeFileSync('.local/template-modernization/build-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
