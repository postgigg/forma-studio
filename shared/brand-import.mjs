import { brandLimits } from './brand-context.mjs';
export const brandFieldLabels={name:'Company name',business:'What your business does',mission:'Mission statement',audience:'Who you serve',voice:'Visual style & voice'};
const fieldSchema={type:'object',additionalProperties:false,required:['value','basis','sourceId','evidence'],properties:{value:{type:'string'},basis:{type:'string',enum:['stated','suggested','unknown']},sourceId:{type:'string'},evidence:{type:'string'}}};
export const brandImportSchema={type:'object',additionalProperties:false,required:Object.keys(brandLimits),properties:Object.fromEntries(Object.keys(brandLimits).map(key=>[key,fieldSchema]))};
const normalized=value=>value.replace(/\s+/g,' ').trim();
export function validateWebsiteDraft(value,pages){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('The AI did not return business details. Please retry or enter them manually.');
  const fields={};
  for(const [key,limit] of Object.entries(brandLimits)){
    const field=value[key];
    if(!field||typeof field.value!=='string'||field.value.length>limit||!['stated','suggested','unknown'].includes(field.basis)||typeof field.sourceId!=='string'||typeof field.evidence!=='string'||field.evidence.length>400)throw new Error('The AI returned an invalid business field. Please retry.');
    const source=pages.find(page=>page.id===field.sourceId),evidence=normalized(field.evidence),text=field.value.trim();
    if(field.basis==='unknown'||!text){fields[key]={value:'',basis:'unknown',sourceUrl:'',evidence:''};continue;}
    // A claimed fact needs a verbatim excerpt from a page the host actually read.
    if(!source||!evidence||!normalized(source.text+' '+source.title).includes(evidence))throw new Error('A website suggestion could not be matched to its source. Please retry or enter it manually.');
    fields[key]={value:text,basis:field.basis,sourceUrl:source.url,evidence};
  }
  if(!Object.values(fields).some(field=>field.value))throw new Error('No usable business information was found. Try an About page or enter your details manually.');
  return fields;
}
