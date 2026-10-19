import { useEffect, useState } from 'react';
import { Check, Copy, LockKeyhole, MessageSquare, Monitor, RefreshCw, UsersRound, Wifi, X } from 'lucide-react';
import type { CollaborationController } from './live-session';
import type { LiveRole } from './desktop';
import { Modal } from './ui';
import './collaboration.css';
const roleLabel={edit:'Can edit',comment:'Can comment',view:'Can view'};
export function CollaborationDialog({live,onClose}:{live:CollaborationController|null;onClose:()=>void}){
  const bridge=window.formaDesktop?.collaboration;
  const [tab,setTab]=useState<'host'|'join'>('host'),[name,setName]=useState(()=>localStorage.getItem('forma:collaboration-name')||''),[code,setCode]=useState('');
  const [networks,setNetworks]=useState<{name:string;address:string}[]>([]),[address,setAddress]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false),[now,setNow]=useState(Date.now());
  const [roles,setRoles]=useState<Record<string,LiveRole>>({});
  useEffect(()=>{void bridge?.interfaces().then(items=>{setNetworks(items);setAddress(items[0]?.address||'');}).catch(e=>setError(e.message));const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[bridge]);
  const state=live?.state,active=state?.mode==='host'||state?.mode==='guest',joining=state?.mode==='joining';
  const run=async(fn:()=>unknown)=>{setError('');setBusy(true);try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const remember=()=>{try{localStorage.setItem('forma:collaboration-name',name.trim());}catch{}};
  const copyInvitation=()=>{const field=document.getElementById('live-code') as HTMLTextAreaElement|null;if(!field)throw new Error('Open the invitation first.');field.focus();field.select();window.formaDesktop!.editText('copy');setCopied(true);setTimeout(()=>setCopied(false),2500);};
  return <Modal title="Work together" onClose={onClose} wide className="live-dialog">
    <div className="live-intro"><div className="live-symbol"><UsersRound size={29}/></div><div><h3>Your design. Your connection.</h3><p>Work together on the same network. Designs and comments travel directly between your computers.</p></div></div>
    {!bridge||!live?<div className="live-empty"><Monitor size={32}/><h3>Open the desktop app to connect</h3><p>Live sessions use a private desktop connection. Your existing designs and local comments work here as usual.</p><a className="primary" href="https://tryformastudio.netlify.app/" target="_blank" rel="noreferrer">Get Forma Studio</a></div>:<>
      {active?<>
        <div className="live-session-summary"><span><LockKeyhole size={16}/>{state.connected?'Encrypted · Direct LAN connection':'Reconnecting to the host'}</span><strong>{live.editor.doc.name}</strong><small>{state.mode==='host'?'You are hosting. Keep Forma open while you work together.':`${roleLabel[state.self?.role||'view']} · A separate copy is saved on this computer.`}</small></div>
        {state.mode==='host'&&state.invitation&&<section className="live-invite"><div><h3>Invite someone</h3><span>{state.invitation.expiresAt>now?`Expires in ${Math.ceil((state.invitation.expiresAt-now)/60000)} min`:'Invitation expired'}</span></div><label htmlFor="live-code">Invitation code</label><textarea id="live-code" aria-label="Invitation code" readOnly rows={3} value={state.invitation.code}/><div><button className="primary" disabled={state.invitation.expiresAt<=now} onClick={()=>run(copyInvitation)}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?'Copied':'Copy invitation'}</button><button className="secondary" onClick={()=>run(()=>bridge.renew())}><RefreshCw size={15}/> New invitation</button></div><p>Send this code privately to someone on your network. It includes your local address; every person still needs your approval.</p></section>}
        {!!state.pending.length&&<section className="live-requests"><h3>Waiting for your approval</h3>{state.pending.map(person=><div className="live-person" key={person.id}><strong>{person.name}</strong><select aria-label={`Permission for ${person.name}`} value={roles[person.id]||'comment'} onChange={e=>setRoles({...roles,[person.id]:e.target.value as LiveRole})}>{Object.entries(roleLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button className="primary" onClick={()=>run(()=>bridge.admit({id:person.id,allow:true,role:roles[person.id]||'comment'}))}>Allow</button><button className="text-button" aria-label={`Decline ${person.name}`} onClick={()=>run(()=>bridge.admit({id:person.id,allow:false,role:'view'}))}><X size={17}/></button></div>)}</section>}
        <section className="live-members"><h3>In this session <span>{state.participants.length}</span></h3>{state.participants.map(person=><div className="live-person" key={person.id}><i style={{background:person.color}}>{person.name.slice(0,1).toUpperCase()}</i><strong>{person.name}{person.id===state.self?.id?' (you)':''}</strong>{state.mode==='host'&&person.id!==state.self?.id?<><select aria-label={`Access for ${person.name}`} value={person.role} onChange={e=>run(()=>bridge.permission({id:person.id,role:e.target.value as LiveRole}))}>{Object.entries(roleLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button className="text-button" aria-label={`Remove ${person.name}`} onClick={()=>run(()=>bridge.remove(person.id))}>Remove</button></>:<span>{person.id===state.participants[0]?.id?'Host':roleLabel[person.role]}</span>}</div>)}</section>
        <div className="live-footer"><span>{live.pendingChanges?'Sending changes…':'Changes saved locally'} · Up to 8 guests</span><button className="secondary" disabled={busy} onClick={()=>run(()=>live.leave())}>{state.mode==='host'?'End session':'Leave session'}</button></div>
      </>:joining?<div className="live-empty"><span className="spinner"/><h3>Waiting for the host</h3><p>Your request has been sent. The host chooses whether you can view, comment or edit.</p><button className="secondary" onClick={()=>run(()=>bridge.stop())}>Cancel request</button></div>:<>
        <div className="live-tabs" role="tablist" aria-label="Connection"><button role="tab" aria-selected={tab==='host'} onClick={()=>setTab('host')}>Start a session</button><button role="tab" aria-selected={tab==='join'} onClick={()=>setTab('join')}>Join with a code</button></div>
        <form onSubmit={e=>{e.preventDefault();remember();void run(()=>tab==='host'?live.host(name,address):live.join(name,code.trim()));}}>
          <label>Your name<input aria-label="Your collaboration name" autoComplete="nickname" maxLength={60} value={name} onChange={e=>setName(e.target.value)} placeholder="What should others call you?" required/></label>
          {tab==='host'?<><label>Network<select aria-label="Collaboration network" value={address} onChange={e=>setAddress(e.target.value)}>{networks.map(item=><option key={item.address} value={item.address}>{item.name} · {item.address}</option>)}</select></label>{!networks.length&&<p role="status">Connect to a private Wi-Fi or Ethernet network to host. Guest networks may prevent devices from connecting.</p>}<div className="live-scope"><Check size={18}/><p>Shares only <strong>{live.editor.doc.name}</strong>, including its images, audio and used fonts. Your other designs, brand profile, AI accounts and cloud credentials stay private.</p></div></>:<label>Invitation code<textarea aria-label="Paste invitation code" rows={4} maxLength={1000} value={code} onChange={e=>setCode(e.target.value)} placeholder="FORMA-LAN-1.…" required/></label>}
          <button className="primary full" disabled={busy||!name.trim()||(tab==='host'?!address:!code.trim())} type="submit">{busy?<span className="spinner"/>:<Wifi size={18}/>} {tab==='host'?'Start live session':'Request to join'}</button>
        </form>
        <p className="live-network-note"><LockKeyhole size={15}/> Same network only. No Forma account, document server or internet relay. Windows may ask you to allow private-network access.</p>
      </>}
      {(error||state?.error)&&<p className="live-error" role="alert">{error||state?.error}</p>}
    </>}
  </Modal>;
}
export function LiveSessionBar({live,onManage,onComments}:{live:CollaborationController;onManage:()=>void;onComments:()=>void}){
  const state=live.state;if(state.mode==='idle')return null;
  return <div className="live-session-bar" role="status"><span className={`live-indicator ${state.connected?'connected':''}`}/><strong>{state.mode==='joining'?'Waiting for approval':state.connected?'Live session':'Reconnecting…'}</strong><span>{state.participants.map(person=>person.name).join(', ')}</span>{live.active&&<small>{roleLabel[state.self?.role||'view']}</small>}<button onClick={onComments}><MessageSquare size={15}/> Comments</button><button onClick={onManage}>{state.pending.length?`${state.pending.length} waiting`:'Manage session'}</button></div>;
}
export function CollaborationCursors({live}:{live:CollaborationController|null}){
  if(!live?.active)return null;
  const editor=live.editor;
  return <div className="live-cursors" aria-hidden="true">{Array.from(live.presence.values()).filter(item=>item.pageId===editor.page.id&&Date.now()-item.seenAt<30000).map(item=>{
    const person=live.participants.find(p=>p.id===item.participantId);if(!person)return null;
    return <div key={item.participantId}>{item.selection.map(id=>{const object=editor.objects.find(o=>o.id===id);if(!object)return null;const box=object.getBoundingRect();return <div key={id} className="live-selection" style={{borderColor:person.color,left:box.left*editor.zoom,top:box.top*editor.zoom,width:box.width*editor.zoom,height:box.height*editor.zoom}}/>;})}{item.x!=null&&item.y!=null&&<div className="live-pointer" style={{left:item.x*editor.zoom,top:item.y*editor.zoom,color:person.color}}><svg width="16" height="20" viewBox="0 0 16 20"><path d="M1 1v15l4-4 4 7 3-2-4-7h6Z" fill="currentColor" stroke="white" strokeWidth="1.5"/></svg><span style={{background:person.color}}>{person.name}</span></div>}</div>;
  })}</div>;
}
