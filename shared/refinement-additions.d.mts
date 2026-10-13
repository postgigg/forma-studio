export interface AddedElement {kind:'star'|'sparkle'|'rect'|'ellipse'|'line'|'text'|'path';name:string;x:number;y:number;width:number;height:number;angle:number;fill:string;stroke:string|null;strokeWidth:number;opacity:number;text:string|null;font:string|null;fontSize:number|null;path:string|null}
export const additionKinds:string[];
export const additionSchema:Record<string,unknown>;
export function validateAdditions(raw:unknown,width:number,height:number,fonts:string[]):AddedElement[];
export function requestedStars(prompt:string):number|null;
