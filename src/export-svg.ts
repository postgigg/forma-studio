import { FabricImage, FabricObject, Group, StaticCanvas, Textbox } from 'fabric';
import { getFont } from './font-library';
import bundledFonts from '../shared/bundled-fonts.json';
const bundled:Record<string,string>=bundledFonts;
function dataUrl(blob:Blob):Promise<string> {return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
async function embedded(url:string) {const response=await fetch(url);if(!response.ok)throw new Error('An export asset could not be loaded.');const bytes=await response.blob();return dataUrl(url.endsWith('.ttf')?new Blob([bytes],{type:'font/ttf'}):bytes);}
export async function portableSvg(canvas:StaticCanvas) {
  const objects:FabricObject[]=[];
  const walk=(items:FabricObject[])=>items.forEach(object=>{objects.push(object);if(object instanceof Group)walk(object.getObjects());});walk(canvas.getObjects());
  const fonts=new Set<string>();
  for(const object of objects) {
    if(object instanceof FabricImage) {
      const src=object.getSrc();
      if(!src.startsWith('data:')) {
        const geometry={width:object.width,height:object.height,cropX:object.cropX,cropY:object.cropY};
        await object.setSrc(await embedded(src));object.set(geometry);
      }
    }
    if(object instanceof Textbox) {
      if(bundled[object.fontFamily] || getFont(object.fontFamily))fonts.add(object.fontFamily);
      for(const line of Object.values(object.styles))for(const style of Object.values(line))if(style.fontFamily && (bundled[style.fontFamily] || getFont(style.fontFamily)))fonts.add(style.fontFamily);
    }
  }
  const styles=await Promise.all([...fonts].map(async family=>{
    const custom=getFont(family), format=custom?.format === 'ttf' ? 'truetype' : custom?.format === 'otf' ? 'opentype' : custom?.format;
    return custom ? `@font-face{font-family:'${family}';src:url('data:font/${custom.format};base64,${custom.data}') format('${format}');}` : `@font-face{font-family:'${family}';font-weight:100 1000;src:url('${await embedded('/fonts/'+bundled[family])}') format('truetype');}`;
  }));
  const svg=canvas.toSVG();
  return styles.length?svg.replace(/(<svg\b[^>]*>)/,`$1<defs><style type="text/css">${styles.join('')}</style></defs>`):svg;
}
