import { FabricImage, FabricObject, Group, StaticCanvas, Textbox } from 'fabric';
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
      if(object.fontFamily.startsWith('Forma '))fonts.add(object.fontFamily);
      for(const line of Object.values(object.styles))for(const style of Object.values(line))if(style.fontFamily?.startsWith('Forma '))fonts.add(style.fontFamily);
    }
  }
  const styles=await Promise.all([...fonts].map(async family=>`@font-face{font-family:'${family}';src:url('${await embedded('/fonts/'+family.toLowerCase().replaceAll(' ','')+'.ttf')}') format('truetype');}`));
  const svg=canvas.toSVG();
  return styles.length?svg.replace(/(<svg\b[^>]*>)/,`$1<defs><style type="text/css">${styles.join('')}</style></defs>`):svg;
}
