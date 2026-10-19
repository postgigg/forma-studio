import { useEffect, useState } from 'react';
import { sharedDesign, validateLiveDesign, diffDesign, applyTransaction, type LiveChange } from '../shared/collaboration.mjs';
import { uid, type Design } from './types';
import type { Editor } from './editor';
import type { LiveBridge, LiveState, LiveEvent, LiveParticipant } from './desktop';

export const idleLiveState:LiveState={mode:'idle',self:null,connected:false,error:'',participants:[],pending:[],invitation:null};
export interface PeerPresence {participantId:string;pageId:string;x:number|null;y:number|null;selection:string[];seenAt:number}
type Pending = {id:string;ops:LiveChange[];history?:'undo'|'redo'};
export class CollaborationController {
  state:LiveState=idleLiveState;
  presence=new Map<string,PeerPresence>();
  active=false;
  private starting=false;
  private applying=false;
  private canonical:any;
  private baseline:any;
  private localId='';
  private pending:Pending[]=[];
  private undoItems:LiveChange[][]=[];
  private redoItems:LiveChange[][]=[];
  private queue:Promise<void>=Promise.resolve();
  private outbound:Promise<unknown>=Promise.resolve();
  private listeners=new Set<()=>void>();
  private detach:()=>void;
  private disposed=false;
  private presenceAt=0;
  private presenceTimer?:ReturnType<typeof setTimeout>;
  private heartbeat:ReturnType<typeof setInterval>;
  private revision=0;
  private buffered:LiveEvent[]=[];
  private pointer={x:null as number|null,y:null as number|null};
  constructor(public editor:Editor,private bridge:LiveBridge,private report:(message:string)=>void) {
    this.detach=bridge.onEvent(event=>this.receive(event));
    void bridge.status().then(state=>{if(!this.disposed){this.state=state;this.changed();}});
    editor.onDocumentChange=()=>this.localChange();
    editor.onDocumentSwitch=async()=>{if(this.active&&!this.starting){await this.leave();this.report('The live session ended because you opened another design.');}};
    editor.canvas.on('mouse:move',this.pointerMove);
    editor.canvas.on('mouse:out',this.pointerOut);
    editor.canvas.on('selection:created',this.selection);
    editor.canvas.on('selection:updated',this.selection);
    editor.canvas.on('selection:cleared',this.selection);
    this.heartbeat=setInterval(()=>this.sendPresence(),10000);
  }
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>this.listeners.delete(fn);};
  private changed(){
    if(this.active){
      this.editor.liveAccess=this.state.connected?(this.state.self?.role||'view'):'view';
      this.editor.liveAuthor=this.state.self?{id:this.state.self.id,name:this.state.self.name}:undefined;
      this.editor.sharedUndoState={canUndo:this.undoItems.length>0,canRedo:this.redoItems.length>0};
      this.editor.onSharedUndo=redo=>this.undo(redo);
    }
    this.editor.notify();for(const fn of this.listeners)fn();
  }
  private pointerMove=({e}:any)=>{if(!this.active)return;const point=this.editor.canvas.getScenePoint(e);this.pointer={x:Math.round(point.x),y:Math.round(point.y)};this.sendPresence();};
  private pointerOut=()=>{this.pointer={x:null,y:null};this.sendPresence();};
  private selection=()=>this.sendPresence();
  sendPresence(point?:{x:number;y:number}){
    if(point)this.pointer={x:Math.round(point.x),y:Math.round(point.y)};
    if(this.disposed||!this.active||!this.state.connected)return;
    const remaining=90-(Date.now()-this.presenceAt);
    if(remaining>0){if(!this.presenceTimer)this.presenceTimer=setTimeout(()=>{this.presenceTimer=undefined;this.sendPresence();},remaining+5);return;}
    this.presenceAt=Date.now();void this.bridge.presence({pageId:this.editor.page.id,...this.pointer,selection:this.editor.canvas.getActiveObjects().map(object=>(object as any).id).filter(Boolean)}).catch(()=>{});
  }
  private receive(event:LiveEvent){
    if(this.disposed)return;
    if(event.type==='state'){
      this.state=event.state!;
      for(const id of this.presence.keys())if(!this.state.participants.some(p=>p.id===id))this.presence.delete(id);
      this.changed();return;
    }
    if(event.type==='presence'){
      if(event.participantId!==this.state.self?.id)this.presence.set(event.participantId!,{participantId:event.participantId!,pageId:event.pageId!,x:event.x??null,y:event.y??null,selection:event.selection||[],seenAt:Date.now()});
      this.changed();return;
    }
    if(event.type==='ended'){
      this.active=false;this.pending=[];this.presence.clear();this.editor.liveAccess='edit';this.editor.liveAuthor=undefined;this.editor.onSharedUndo=undefined;this.editor.sharedUndoState=undefined;
      this.undoItems=[];this.redoItems=[];
      // A disconnected document is now a normal local file. Its undo must not
      // restore a pre-session snapshot over the shared result.
      this.editor.history=[];this.editor.historyIndex=-1;
      this.queue=this.queue.then(async()=>{while(this.editor.busy)await new Promise(resolve=>setTimeout(resolve,30));this.editor.commit();await this.editor.save();}).catch(error=>this.report(error.message));
      this.report(event.message||'The session ended. Your local copy is saved.');this.changed();return;
    }
    if(this.starting){if(event.type==='snapshot'||event.type==='commit')this.buffered.push(event);return;}
    if(!this.active)return;
    if(event.type==='snapshot'||event.type==='commit'){
      this.queue=this.queue.then(async()=>{
        if(!this.active||this.disposed)return;
        if((event.revision??0)<=this.revision)return;
        if(event.type==='snapshot'){validateLiveDesign(event.design);this.canonical=event.design;}
        else {
          this.canonical=applyTransaction(this.canonical,event.ops||[],{authoritative:true}).design;
          const own=this.pending.find(item=>item.id===event.transactionId);
          this.pending=this.pending.filter(item=>item.id!==event.transactionId);
          if(own&&event.ops?.length){
            if(!own.history){this.undoItems.push(event.ops);this.redoItems=[];}
            if(this.undoItems.length>50)this.undoItems.shift();
          }
          if(own&&event.conflicts?.length)this.report('Someone changed the same property first. Their latest value was kept; your other changes were merged.');
        }
        this.revision=event.revision??this.revision;await this.reconcile();this.changed();
      }).catch(error=>this.report(error.message));
    }
  }
  private projected(){let result=this.canonical;for(const item of this.pending)result=applyTransaction(result,item.ops,{authoritative:true}).design;return result;}
  private async reconcile(){
    let applied=false;
    while(this.active&&!applied){
    while(this.active&&(this.editor.busy||(this.editor.canvas as any)._currentTransform))await new Promise(resolve=>setTimeout(resolve,40));
    if(!this.active)return;
    // Capture edits still in the text debounce before applying another peer's
    // update. Incremental canvas updates preserve unchanged images and text.
    this.editor.commit();
    const design=this.projected();
    this.applying=true;
    try{
      const incoming={...design,id:this.localId,updatedAt:new Date().toISOString(),pages:design.pages.map((page:any)=>({...page,thumbnail:''}))} as Design;
      applied=await this.editor.applySharedDocument(incoming);
      if(applied)this.baseline=sharedDesign(this.editor.doc);
    }finally{this.applying=false;}
    }
  }
  private localChange(){
    if(!this.active||this.applying)return true;
    const current=sharedDesign(this.editor.doc),ops=diffDesign(this.baseline,current);
    if(!ops.length)return true;
    const role=this.editor.liveAccess;
    if(role==='view'||(role==='comment'&&ops.some(op=>op.path[0]!=='page'||op.path[2]!=='comment'))){
      this.report(role==='view'?'This session is view only.':'You can add comments; artwork editing is reserved for editors.');
      this.queue=this.queue.then(()=>this.reconcileRejected()).catch(error=>this.report(error.message));return false;
    }
    this.baseline=current;
    this.send({id:uid(),ops});return true;
  }
  private async reconcileRejected(){let applied=false;this.applying=true;try{applied=await this.editor.applySharedDocument({...this.projected(),id:this.localId,updatedAt:new Date().toISOString(),pages:this.projected().pages.map((page:any)=>({...page,thumbnail:''}))});if(applied)this.baseline=sharedDesign(this.editor.doc);}finally{this.applying=false;}if(!applied)await this.reconcile();}
  private send(item:Pending){
    this.pending.push(item);this.changed();
    this.outbound=this.outbound.then(()=>this.active?this.bridge.publish({id:item.id,ops:item.ops}):undefined).catch(error=>{
      if(!this.pending.some(p=>p.id===item.id))return;
      this.pending=this.pending.filter(p=>p.id!==item.id);this.report(error.message);
      this.queue=this.queue.then(()=>this.reconcileRejected()).catch(err=>this.report(err.message));
    });
  }
  async host(name:string,address:string){
    if(this.active)throw new Error('Leave the current session first.');
    this.starting=true;
    try{
      const doc=this.editor.prepareLive();
      const result=await this.bridge.host({name,address,design:sharedDesign(doc)});
      this.initialize(result.design,result.state,this.editor.doc.id,result.revision);await this.editor.save();
    }finally{this.starting=false;for(const event of this.buffered.splice(0))this.receive(event);}
  }
  async join(name:string,code:string){
    if(this.active)throw new Error('Leave the current session first.');
    this.starting=true;
    try{
      await this.editor.save();
      const result=await this.bridge.join({name,code});
      const localId=uid(),design={...result.design,id:localId,updatedAt:new Date().toISOString(),pages:result.design.pages.map((page:any)=>({...page,thumbnail:''}))};
      await this.editor.open(design);
      this.initialize(result.design,result.state,localId,result.revision);
    }catch(error){if(this.state.mode==='guest')await this.bridge.stop();throw error;}
    finally{this.starting=false;for(const event of this.buffered.splice(0))this.receive(event);}
  }
  private initialize(design:any,state:LiveState,localId:string,revision:number){
    this.state=state;this.canonical=structuredClone(design);this.baseline=sharedDesign(this.editor.doc);this.localId=localId;
    this.revision=revision;this.active=true;this.pending=[];this.undoItems=[];this.redoItems=[];this.changed();this.sendPresence();
  }
  async undo(redo=false){
    if(this.editor.liveAccess!=='edit')return;
    await this.flush();
    const source=redo?this.redoItems:this.undoItems,ops=source.pop();if(!ops)return;
    const inverse=ops.slice().reverse().map(op=>({path:op.path,...(op.after===undefined?{}:{before:op.after}),...(op.before===undefined?{}:{after:op.before})}));
    (redo?this.undoItems:this.redoItems).push(inverse);
    this.send({id:uid(),ops:inverse,history:redo?'redo':'undo'});
    await this.reconcileRejected();this.changed();
  }
  async flush(){
    if(!this.active)return;
    this.editor.commit();
    const deadline=Date.now()+15000;
    while(this.pending.length&&this.active&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,30));
    await this.queue;
    if(this.pending.length)throw new Error('Some changes have not reached the host. Keep this session open or export a local copy.');
  }
  async leave(){await this.flush();await this.editor.save();await this.bridge.stop();}
  get participants():LiveParticipant[]{return this.state.participants;}
  get pendingChanges(){return this.pending.length;}
  async dispose(){
    this.active=false;clearInterval(this.heartbeat);clearTimeout(this.presenceTimer);
    this.disposed=true;this.detach();this.editor.onDocumentChange=undefined;this.editor.onDocumentSwitch=undefined;this.editor.onSharedUndo=undefined;this.editor.sharedUndoState=undefined;
    this.editor.canvas.off('mouse:move',this.pointerMove);this.editor.canvas.off('mouse:out',this.pointerOut);
    this.editor.canvas.off('selection:created',this.selection);this.editor.canvas.off('selection:updated',this.selection);this.editor.canvas.off('selection:cleared',this.selection);
    await this.bridge.stop();
  }
}
export function useCollaboration(editor:Editor|null,report:(message:string)=>void){
  const [controller,setController]=useState<CollaborationController|null>(null),[,setRevision]=useState(0);
  useEffect(()=>{
    const bridge=window.formaDesktop?.collaboration;if(!editor||!bridge)return;
    const live=new CollaborationController(editor,bridge,report),unsubscribe=live.subscribe(()=>setRevision(value=>value+1));setController(live);
    return()=>{unsubscribe();void live.dispose();setController(null);};
  },[editor,report]);
  return controller;
}
