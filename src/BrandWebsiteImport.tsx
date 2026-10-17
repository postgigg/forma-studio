import { useEffect,useRef,useState,useId } from 'react';
import { Globe,PenLine,Sparkles } from 'lucide-react';
import { designerRequest } from './ai';
import type { BrandProfile } from '../shared/brand-context.mjs';
import { brandLimits } from '../shared/brand-context.mjs';
import { brandFieldLabels,type BrandField,type WebsiteBrandResult } from '../shared/brand-import.mjs';
import './brand-website.css';
type Job={id:string;url:string;status:'running'|'completed'|'failed'|'cancelled';stage:string;error:string|null;result:WebsiteBrandResult|null};
const remembered='forma-brand-website-job';
function restored(){try{const value=JSON.parse(sessionStorage.getItem(remembered)||'null');return value&&/^[a-f0-9-]{36}$/.test(value.id)?value as {id:string;url:string}:null;}catch{return null;}}
export function BrandWebsiteImport({value,onApply}:{value:BrandProfile;onApply:(fields:Partial<BrandProfile>)=>void}){
  const [mode,setMode]=useState<'manual'|'website'>('manual'),[address,setAddress]=useState(''),[job,setJob]=useState<Job|null>(null),[result,setResult]=useState<WebsiteBrandResult|null>(null),[failure,setFailure]=useState(''),[notice,setNotice]=useState(''),[connecting,setConnecting]=useState(false),[retrying,setRetrying]=useState(false),[chosen,setChosen]=useState<BrandField[]>([]),[edited,setEdited]=useState<Partial<BrandProfile>>({});
  const token=useRef(''),alive=useRef(true),current=useRef(value),inputId=useId();current.current=value;
  const busy=connecting||job?.status==='running';
  function review(next:WebsiteBrandResult){setResult(next);setEdited(Object.fromEntries(Object.entries(next.fields).map(([key,field])=>[key,field.value])));setChosen((Object.keys(brandLimits) as BrandField[]).filter(key=>next.fields[key].value&&!current.current[key].trim()));}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    if(mode!=='website')return;
    let stopped=false;
    void designerRequest('/session').then(session=>{if(stopped)return;token.current=session.token;const pending=restored();if(pending&&!job&&!result){setAddress(pending.url);setJob({id:pending.id,url:pending.url,status:'running',stage:'Reconnecting to your website draft',error:null,result:null});}}).catch(error=>{if(!stopped)setFailure(error.message+' You can enter the information manually.');});
    return()=>{stopped=true;};
  },[mode]);
  useEffect(()=>{
    if(!job||job.status!=='running')return;
    let stopped=false,timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try{
        const next:Job=await designerRequest('/brand-imports/'+job.id,token.current);
        if(stopped)return;setRetrying(false);setJob(next);
        if(next.status==='completed'&&next.result){review(next.result);sessionStorage.removeItem(remembered);}
        else if(next.status==='failed'||next.status==='cancelled'){sessionStorage.removeItem(remembered);setFailure(next.status==='failed'?next.error||'The website could not be read. Enter details manually or try again.':'');}
        else timer=setTimeout(poll,1400);
      }catch(error){if(stopped)return;const status=(error as {status?:number}).status;if(status===404||status===403){sessionStorage.removeItem(remembered);setJob(null);setFailure((error as Error).message);}else{setRetrying(true);timer=setTimeout(poll,2500);}}
    };void poll();return()=>{stopped=true;clearTimeout(timer);};
  },[job?.id,job?.status]);
  async function start(){
    setConnecting(true);setFailure('');setNotice('');setResult(null);
    try{
      const session=await designerRequest('/session');token.current=session.token;
      if(!session.ready)throw new Error('Connect your Codex account in AI Designer first. Manual entry is available now.');
      const next:Job=await designerRequest('/brand-imports',token.current,{method:'POST',body:JSON.stringify({url:address})});
      sessionStorage.setItem(remembered,JSON.stringify({id:next.id,url:next.url}));if(!alive.current)return;setJob(next);
      if(next.status==='completed'&&next.result)review(next.result);
    }catch(error){if(alive.current)setFailure((error as Error).message);}finally{if(alive.current)setConnecting(false);}
  }
  return <section className="brand-website-import" aria-label="Add your business information">
    <div className="brand-entry-choice" role="group" aria-label="How to add your business information">
      <button type="button" aria-pressed={mode==='manual'} disabled={!!busy} onClick={()=>{setMode('manual');setFailure('');}}><PenLine size={17}/>Enter manually</button>
      <button type="button" aria-pressed={mode==='website'} disabled={!!busy} onClick={()=>setMode('website')}><Globe size={17}/>Use my website</button>
    </div>
    {mode==='manual'?<p className="brand-import-help">Enter your business details below. You can leave a field blank and return to it later.</p>:<>
      <p className="brand-import-help">AI reads your public website and drafts the details. Review and edit them before saving. Uses your Codex account.</p>
      <label className="brand-website-address" htmlFor={inputId}>Your business website<input id={inputId} aria-label="Your business website" inputMode="url" autoComplete="url" placeholder="yourbusiness.com" value={address} maxLength={2048} disabled={!!busy} onChange={event=>setAddress(event.target.value)}/></label>
      <div className="brand-import-actions"><button type="button" className="secondary" disabled={!!busy||!address.trim()} onClick={()=>void start()}><Sparkles size={16}/>{busy?'Reading website…':'Draft from website'}</button>{job?.status==='running'&&<button type="button" className="text-button" onClick={()=>{void designerRequest('/brand-imports/'+job.id,token.current,{method:'DELETE'}).then(next=>{setJob(next);sessionStorage.removeItem(remembered);}).catch(error=>setFailure(error.message));}}>Cancel</button>}</div>
      {busy&&<p role="status" className="brand-import-progress">{retrying?'Reconnecting. Your AI draft can keep running.':job?.stage||'Connecting to your local AI…'}</p>}
      {result&&<div className="brand-import-review">
        <h3>Review your website draft</h3><p>Empty fields are selected. Select any existing detail you want to replace.</p>
        {(Object.keys(brandLimits) as BrandField[]).map(key=>{const field=result.fields[key];return <div className="brand-import-field" key={key}>
          {field.value?<><label className="brand-import-check"><input type="checkbox" aria-label={`Use website ${brandFieldLabels[key]}`} checked={chosen.includes(key)} onChange={event=>setChosen(items=>event.target.checked?[...items,key]:items.filter(item=>item!==key))}/><strong>{brandFieldLabels[key]}</strong><span>{field.basis==='stated'?'From website':'AI suggestion'}</span></label><textarea aria-label={`Website draft ${brandFieldLabels[key]}`} maxLength={brandLimits[key]} rows={key==='mission'?3:2} value={edited[key]||''} onChange={event=>setEdited({...edited,[key]:event.target.value})}/><details><summary>Source evidence</summary><blockquote>{field.evidence}</blockquote><a href={field.sourceUrl} target="_blank" rel="noopener noreferrer">Read source page ↗</a></details></>:<p><strong>{brandFieldLabels[key]}</strong> — No supported information found. Enter it below.</p>}
        </div>;})}
        {result.warnings.map(warning=><p className="brand-import-help" key={warning}>{warning}</p>)}
        <button type="button" className="secondary" disabled={!chosen.length} onClick={()=>{onApply(Object.fromEntries(chosen.map(key=>[key,edited[key]||''])));setNotice(`${chosen.length} ${chosen.length===1?'field':'fields'} filled. Review the details below, then save when ready.`);}}>Fill {chosen.length||'selected'} {chosen.length===1?'field':'fields'}</button>
      </div>}
    </>}
    {failure&&<p role="alert" className="brand-import-failure">{failure}</p>}{notice&&<p role="status" className="brand-import-notice">{notice}</p>}
  </section>;
}
